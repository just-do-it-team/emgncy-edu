#!/usr/bin/env bash
set -Eeuo pipefail

readonly source_dir=/build/tts-worker
readonly llama_dir=/opt/llama.cpp
readonly build_dir=/build/voice-build
readonly output_dir=/opt/speech/bin
readonly marker_file="${output_dir}/.build-fingerprint"
readonly cuda_architectures="${CUDA_ARCHITECTURES:-75-real}"

mkdir -p "${build_dir}" "${output_dir}"

llama_commit="$(git -C "${llama_dir}" rev-parse HEAD)"
worker_hash="$({
    find "${source_dir}" -type f -print0 \
        | sort -z \
        | xargs -0 sha256sum
} | sha256sum | awk '{print $1}')"
cuda_version="$(nvcc --version | tail -n 1)"
fingerprint="$(printf '%s\n' \
    "llama=${llama_commit}" \
    "worker=${worker_hash}" \
    "cuda=${cuda_version}" \
    "architectures=${cuda_architectures}" \
    | sha256sum | awk '{print $1}')"

artifacts_are_complete() {
    local directory="$1"
    local library
    [[ -x "${directory}/qwen-tts-worker" ]] || return 1
    for library in \
        libggml.so \
        libggml-base.so \
        libggml-cuda.so \
        libllama.so \
        libllama-common.so \
        libmtmd.so;
    do
        compgen -G "${directory}/${library}*" >/dev/null || return 1
    done
}

artifacts_are_current() {
    artifacts_are_complete "${output_dir}" || return 1
    [[ -f "${marker_file}" ]] || return 1
    [[ "$(<"${marker_file}")" == "${fingerprint}" ]]
}

if artifacts_are_current; then
    echo "TTS worker уже собран для CUDA architectures=${cuda_architectures}; используем volume-кэш."
    exit 0
fi

echo "Собираем TTS worker для CUDA architectures=${cuda_architectures}."
cmake -S "${source_dir}" -B "${build_dir}" -G Ninja \
    -DLLAMA_CPP_DIR="${llama_dir}" \
    -DGGML_CUDA=ON \
    -DGGML_NATIVE=OFF \
    "-DCMAKE_CUDA_ARCHITECTURES=${cuda_architectures}" \
    "-DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined" \
    -DCMAKE_BUILD_TYPE=Release
cmake --build "${build_dir}" \
    --target qwen-tts-worker \
    --parallel

staging_dir="$(mktemp -d)"
trap 'rm -rf -- "${staging_dir}"' EXIT
cp -a "${build_dir}/bin/." "${staging_dir}/"

artifacts_are_complete "${staging_dir}"
find "${output_dir}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "${staging_dir}/." "${output_dir}/"
printf '%s\n' "${fingerprint}" >"${marker_file}"

echo "TTS worker собран и сохранён в volume ${output_dir}."
