fn main() {
    // Compile the pure-C Phonon-2 inference engine (csrc/phonon2).
    let phonon_srcs = [
        "csrc/phonon2/blas.c",
        "csrc/phonon2/threadpool.c",
        "csrc/phonon2/tensor_ops.c",
        "csrc/phonon2/encoder.c",
        "csrc/phonon2/decoder.c",
        "csrc/phonon2/mel.c",
        "csrc/phonon2/weights.c",
        "csrc/phonon2/tokens.c",
        "csrc/phonon2/wav.c",
        "csrc/phonon2/resample.c",
        "csrc/phonon2/segment.c",
        "csrc/phonon2/engine.c",
        "csrc/phonon2/json.c",
    ];
    for src in &phonon_srcs {
        println!("cargo:rerun-if-changed={}", src);
    }
    println!("cargo:rerun-if-changed=csrc/phonon2/phonon2.h");
    println!("cargo:rerun-if-changed=csrc/phonon2/blas.h");
    println!("cargo:rerun-if-changed=csrc/phonon2/threadpool.h");

    let mut build = cc::Build::new();
    build
        .include("csrc/phonon2")
        .files(&phonon_srcs)
        .opt_level(3)
        .flag_if_supported("-std=c11")
        .flag_if_supported("-ffast-math")
        .flag_if_supported("-funroll-loops")
        .flag_if_supported("-pthread")
        .warnings(false);

    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    if target_arch == "aarch64" {
        build.flag_if_supported("-march=armv8.2-a+dotprod");
    } else if target_arch == "x86_64" {
        build.flag_if_supported("-mavx2");
        build.flag_if_supported("-mfma");
    }

    build.compile("phonon2");

    // Ensure Swift runtime libraries can be found at runtime (needed by screencapturekit crate).
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        if let Ok(output) = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
        {
            if output.status.success() {
                let xcode_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                println!(
                    "cargo:rustc-link-arg=-Wl,-rpath,{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
                    xcode_path
                );
            }
        }
    }

    tauri_build::build()
}
