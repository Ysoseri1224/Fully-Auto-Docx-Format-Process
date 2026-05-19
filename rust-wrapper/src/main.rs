use clap::Parser;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

#[derive(Parser, Debug)]
#[command(name = "writemaster-rs")]
#[command(about = "Rust wrapper for the shared WriteMaster Node core")]
struct Cli {
    #[arg(long, value_name = "FILE", conflicts_with = "docx")]
    md: Option<PathBuf>,

    #[arg(long, value_name = "FILE", conflicts_with = "md")]
    docx: Option<PathBuf>,

    #[arg(value_name = "NAME")]
    name: Option<String>,

    #[arg(long, value_name = "FILE")]
    out: Option<PathBuf>,

    #[arg(long, value_name = "FILE")]
    master: Option<PathBuf>,

    #[arg(long = "master-id", value_name = "ID")]
    master_id: Option<String>,

    #[arg(long, value_name = "FILE")]
    extract: Option<PathBuf>,

    #[arg(long, value_name = "PATH")]
    pandoc: Option<PathBuf>,

    #[arg(long = "backup-md", value_name = "FILE")]
    backup_md: Option<PathBuf>,

    #[arg(long, value_name = "PATH")]
    node: Option<PathBuf>,
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let repo = repo_root();
    let node_bin = cli
        .node
        .unwrap_or_else(|| PathBuf::from("node"));

    let preferred_bundle = repo.join("dist").join("writemaster.single.cjs");
    let fallback_cli = repo.join("src").join("cli.js");
    let target_script = if preferred_bundle.exists() {
        preferred_bundle
    } else {
        fallback_cli
    };

    let mut args: Vec<String> = vec![target_script.to_string_lossy().to_string()];
    if let Some(md) = cli.md {
      args.push("--md".into());
      args.push(md.to_string_lossy().to_string());
    } else if let Some(docx) = cli.docx {
      args.push("--docx".into());
      args.push(docx.to_string_lossy().to_string());
    } else {
      eprintln!("Either --md or --docx is required.");
      return ExitCode::from(2);
    }

    if let Some(name) = cli.name {
        args.push(name);
    }
    if let Some(out) = cli.out {
        args.push("--out".into());
        args.push(out.to_string_lossy().to_string());
    }
    if let Some(master) = cli.master {
        args.push("--master".into());
        args.push(master.to_string_lossy().to_string());
    }
    if let Some(master_id) = cli.master_id {
        args.push("--master-id".into());
        args.push(master_id);
    }
    if let Some(extract) = cli.extract {
        args.push("--extract".into());
        args.push(extract.to_string_lossy().to_string());
        // --extract is a standalone mode; skip the md/docx requirement
        let status = Command::new(node_bin)
            .args(args)
            .current_dir(repo)
            .status();
        return match status {
            Ok(status) if status.success() => ExitCode::SUCCESS,
            Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
            Err(error) => {
                eprintln!("Failed to launch Node wrapper: {error}");
                ExitCode::from(1)
            }
        };
    }
    if let Some(pandoc) = cli.pandoc {
        args.push("--pandoc".into());
        args.push(pandoc.to_string_lossy().to_string());
    }
    if let Some(backup_md) = cli.backup_md {
        args.push("--backup-md".into());
        args.push(backup_md.to_string_lossy().to_string());
    }

    let status = Command::new(node_bin)
        .args(args)
        .current_dir(repo)
        .status();

    match status {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
        Err(error) => {
            eprintln!("Failed to launch Node wrapper: {error}");
            ExitCode::from(1)
        }
    }
}
