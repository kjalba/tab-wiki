package config

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ResolvePATH fixes the truncated PATH that a browser-spawned native messaging
// host inherits on macOS (launchd gives GUI apps only /usr/bin:/bin:...).
// It asks the user's login shell for its PATH and merges in common tool dirs,
// so engine binaries installed via Homebrew, npm, bun, etc. are found.
func ResolvePATH() {
	parts := strings.Split(os.Getenv("PATH"), ":")
	parts = append(parts, loginShellPath()...)
	parts = append(parts, commonDirs()...)

	seen := map[string]bool{}
	var merged []string
	for _, p := range parts {
		if p != "" && !seen[p] {
			seen[p] = true
			merged = append(merged, p)
		}
	}
	os.Setenv("PATH", strings.Join(merged, ":"))
}

func loginShellPath() []string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// -l: login shell (sources profile). -i can hang on some setups, so avoid it.
	out, err := exec.CommandContext(ctx, shell, "-l", "-c", "echo $PATH").Output()
	if err != nil {
		return nil
	}
	return strings.Split(strings.TrimSpace(string(out)), ":")
}

func commonDirs() []string {
	home, _ := os.UserHomeDir()
	candidates := []string{
		"/opt/homebrew/bin", "/opt/homebrew/sbin",
		"/usr/local/bin", "/usr/local/sbin",
		"/opt/local/bin",
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, ".bun", "bin"),
		filepath.Join(home, ".claude", "local"),
		filepath.Join(home, "go", "bin"),
		filepath.Join(home, ".cargo", "bin"),
	}
	var existing []string
	for _, d := range candidates {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			existing = append(existing, d)
		}
	}
	return existing
}

// ExpandBin expands a leading ~ in an engine's configured binary path so users
// can hardcode an absolute path as a fallback if PATH resolution ever fails.
func ExpandBin(bin string) string {
	if strings.HasPrefix(bin, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, bin[2:])
		}
	}
	return bin
}
