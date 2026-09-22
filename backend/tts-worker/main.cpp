#include "arg.h"
#include "common.h"
#include "sampling.h"
#include "log.h"
#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"

#include <cstdio>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {

constexpr size_t MAX_PROMPT_BYTES = 4 * 1024 * 1024;

struct synthesis_result {
    std::vector<char> audio;
    int32_t sample_rate = 0;
    int n_frames = 0;
    double prompt_seconds = 0.0;
    double generation_seconds = 0.0;
    double vocoder_seconds = 0.0;
};

struct progress_timings {
    int64_t started_us = ggml_time_us();
    int64_t last_report_us = started_us;

    void report(int n_frames) {
        const int64_t now_us = ggml_time_us();
        if (now_us - last_report_us < 2000000) {
            return;
        }
        last_report_us = now_us;
        const double elapsed = (now_us - started_us) / 1e6;
        LOG_INF("frames generated: %d, speed: %.2f frames/s\n",
                n_frames, elapsed > 0.0 ? n_frames / elapsed : 0.0);
    }
};

void print_usage(int, char ** argv) {
    LOG("\nexample usage:\n");
    LOG("\n    %s -m backbone.gguf -mm mmproj.gguf --tts-speaker-file speaker.wav --tts-lang ru\n",
        argv[0]);
    LOG("\nThe worker reads framed SYNTH requests from stdin and writes WAV responses to stdout.\n\n");
}

bool synthesize(
        common_params & params,
        common_init_result & llama_init,
        llama_context * lctx,
        mtmd_helper::gen_audio & gen,
        mtmd_bitmap * speaker_bitmap,
        const std::string & prompt,
        synthesis_result & result,
        std::string & error) {
    if (llama_memory_t memory = llama_get_memory(lctx)) {
        // Clearing metadata is sufficient to make the next request independent;
        // zeroing the entire KV buffer would add avoidable latency.
        llama_memory_clear(memory, false);
    }
    llama_init.reset_samplers();
    common_sampler * smpl = llama_init.sampler(0);
    if (!smpl) {
        error = "failed to reset sampler";
        return false;
    }

    mtmd_helper_gen_audio_inp inp{};
    inp.seq_id = 0;
    inp.prompt = prompt.data();
    inp.prompt_len = prompt.size();
    inp.speaker_ref = speaker_bitmap;
    inp.lang = params.tts_lang.c_str();
    inp.top_k = params.sampling.top_k;
    inp.top_p = params.sampling.top_p;
    inp.seed = params.sampling.seed;
    inp.out_type = MTMD_HELPER_GEN_AUDIO_OUTTYPE_WAV;

    if (gen.set_input(&inp) != 0) {
        error = "set_input failed";
        return false;
    }

    const int64_t prompt_started_us = ggml_time_us();
    for (;;) {
        const int32_t remaining = gen.step_prompt(params.n_batch);
        if (remaining < 0) {
            error = "prompt processing failed";
            return false;
        }
        if (remaining == 0) {
            break;
        }
    }

    auto sample_semantic_code = [&]() -> llama_token {
        const llama_token token = common_sampler_sample(smpl, lctx, -1);
        common_sampler_accept(smpl, token, true);
        return token;
    };

    const int64_t generation_started_us = ggml_time_us();
    result.prompt_seconds = (generation_started_us - prompt_started_us) / 1e6;

    const int max_new = params.n_predict > 0 ? params.n_predict : 512;
    llama_token sampled = sample_semantic_code();
    const float * h_state = llama_get_embeddings_ith(lctx, -1);
    if (!h_state) {
        error = "backbone did not return hidden state";
        return false;
    }

    progress_timings progress;
    bool stop = false;
    while (!stop && result.n_frames < max_new) {
        const float * h_next = nullptr;
        if (gen.step_gen(sampled, h_state, &h_next, &stop) != 0) {
            error = "step_gen failed at frame " + std::to_string(result.n_frames);
            return false;
        }
        if (!h_next) {
            break;
        }
        ++result.n_frames;
        h_state = h_next;
        sampled = sample_semantic_code();
        progress.report(result.n_frames);
    }
    result.generation_seconds = (ggml_time_us() - generation_started_us) / 1e6;

    const char * data = nullptr;
    size_t data_len = 0;
    int64_t n_samples = 0;
    const int64_t vocoder_started_us = ggml_time_us();
    if (gen.get_output(
            &result.sample_rate, &data, &data_len, &n_samples) != 0) {
        error = "get_output failed";
        return false;
    }
    result.vocoder_seconds = (ggml_time_us() - vocoder_started_us) / 1e6;
    if (!data || data_len == 0) {
        error = "vocoder returned empty audio";
        return false;
    }
    result.audio.assign(data, data + data_len);

    const double total = result.prompt_seconds
        + result.generation_seconds
        + result.vocoder_seconds;
    const double audio_seconds = result.sample_rate > 0
        ? static_cast<double>(n_samples) / result.sample_rate
        : 0.0;
    LOG_INF("generated %d frames, %zu bytes of WAV audio (%d Hz)\n",
            result.n_frames, result.audio.size(), result.sample_rate);
    LOG_INF("timings: prompt eval %.2fs + generation %.2fs + vocoder %.2fs = total %.2fs\n",
            result.prompt_seconds, result.generation_seconds,
            result.vocoder_seconds, total);
    LOG_INF("         output audio = %.2fs (audio time = %.2fx process time)\n",
            audio_seconds, total > 0.0 ? audio_seconds / total : 0.0);
    return true;
}

void send_error(const std::string & message) {
    std::cout << "ERR " << message.size() << '\n';
    std::cout.write(message.data(), static_cast<std::streamsize>(message.size()));
    std::cout.flush();
}

int run_worker(common_params & params) {
    auto llama_init = common_init_from_params(params);
    if (!llama_init || !llama_init->model() || !llama_init->context()) {
        LOG_ERR("failed to init model/context\n");
        return 1;
    }

    llama_model * model = llama_init->model();
    llama_context * lctx = llama_init->context();

    mtmd_context_params mtmd_params = mtmd_context_params_default();
    mtmd_params.use_gpu = params.mmproj_use_gpu;
    mtmd_params.device = params.mmproj_device;
    mtmd::context_ptr mctx(
        mtmd_init_from_file(params.mmproj.path.c_str(), model, mtmd_params)
    );
    if (!mctx) {
        LOG_ERR("failed to load mmproj %s\n", params.mmproj.path.c_str());
        return 1;
    }
    if (mtmd_gen_audio_get_info(mctx.get()).type == MTMD_GEN_AUDIO_TYPE_NONE) {
        LOG_ERR("mmproj does not support audio generation\n");
        return 1;
    }

    mtmd::bitmap_ptr speaker_bitmap;
    if (!params.tts_speaker_file.empty()) {
        auto wrapper = mtmd_helper_bitmap_init_from_file(
            mctx.get(),
            params.tts_speaker_file.c_str(),
            false,
            mtmd_helper_init_opt_default()
        );
        if (!wrapper.bitmap) {
            LOG_ERR("failed to load speaker file %s\n",
                    params.tts_speaker_file.c_str());
            return 1;
        }
        speaker_bitmap.reset(wrapper.bitmap);
    }

    mtmd_helper::gen_audio gen(lctx, mctx.get());
    std::cout << "READY\n";
    std::cout.flush();

    std::string header;
    while (std::getline(std::cin, header)) {
        if (header == "QUIT") {
            break;
        }

        std::istringstream parser(header);
        std::string command;
        size_t prompt_size = 0;
        parser >> command >> prompt_size;
        parser >> std::ws;
        if (command != "SYNTH" || !parser.eof() || prompt_size == 0
                || prompt_size > MAX_PROMPT_BYTES) {
            send_error("invalid request header");
            continue;
        }

        std::string prompt(prompt_size, '\0');
        if (!std::cin.read(prompt.data(), static_cast<std::streamsize>(prompt_size))) {
            LOG_ERR("stdin closed while reading prompt\n");
            return 1;
        }

        synthesis_result result;
        std::string error;
        if (!synthesize(
                params, *llama_init, lctx, gen, speaker_bitmap.get(),
                prompt, result, error)) {
            send_error(error);
            continue;
        }

        const double total = result.prompt_seconds
            + result.generation_seconds
            + result.vocoder_seconds;
        std::cout << "OK "
                  << result.sample_rate << ' '
                  << result.audio.size() << ' '
                  << result.n_frames << ' '
                  << std::fixed << std::setprecision(6)
                  << result.prompt_seconds << ' '
                  << result.generation_seconds << ' '
                  << result.vocoder_seconds << ' '
                  << total << '\n';
        std::cout.write(
            result.audio.data(),
            static_cast<std::streamsize>(result.audio.size())
        );
        std::cout.flush();
    }
    return 0;
}

} // namespace

int main(int argc, char ** argv) {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    common_params params;
    common_init();
    if (!common_params_parse(
            argc, argv, params, LLAMA_EXAMPLE_TTS, print_usage)) {
        return 1;
    }
    if (params.mmproj.path.empty()) {
        LOG_ERR("no mmproj provided, use --mmproj\n");
        return 1;
    }

    mtmd_helper_log_set(common_log_default_callback, nullptr);
    params.embedding = true;

    llama_backend_init();
    llama_numa_init(params.numa);
    const int result = run_worker(params);
    llama_backend_free();
    return result;
}
