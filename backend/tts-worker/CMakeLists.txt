cmake_minimum_required(VERSION 3.18)

project(qwen_tts_worker LANGUAGES C CXX)

set(LLAMA_CPP_DIR "" CACHE PATH "Path to the llama.cpp source tree")
if(NOT EXISTS "${LLAMA_CPP_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "Set LLAMA_CPP_DIR to the llama.cpp source directory")
endif()

set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_UI OFF CACHE BOOL "" FORCE)
set(LLAMA_USE_PREBUILT_UI OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)

add_subdirectory("${LLAMA_CPP_DIR}" llama.cpp-build EXCLUDE_FROM_ALL)

add_executable(qwen-tts-worker main.cpp)
target_link_libraries(
    qwen-tts-worker
    PRIVATE llama llama-common mtmd ${CMAKE_THREAD_LIBS_INIT}
)
target_compile_features(qwen-tts-worker PRIVATE cxx_std_17)
set_target_properties(
    qwen-tts-worker
    PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
