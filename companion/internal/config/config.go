// Package config loads and persists the Companion configuration.
// The config file lives inside the Archive repo (config.json) so it is
// versioned by auto-commits and editable by the user or their agents.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// EngineConfig describes one registered Engine.
// Args is an argv template; the placeholders {MODEL} and {PROMPT} are
// substituted at invocation time. If {PROMPT} is absent, the prompt is
// written to stdin instead.
type EngineConfig struct {
	Name    string   `json:"name"`
	Bin     string   `json:"bin"`
	Args    []string `json:"args"`
	Models  []string `json:"models"`
	Enabled bool     `json:"enabled"`
	// ModelsCommand, when set, is an argv that prints one model id per line;
	// its output is merged with the static Models list. This is the hook for
	// engines that can report their own models (e.g. a future codex adapter).
	ModelsCommand []string `json:"modelsCommand,omitempty"`
}

type Config struct {
	ActiveEngine string         `json:"activeEngine"`
	ActiveModel  string         `json:"activeModel"`
	StaleDays    int            `json:"staleDays"`
	EngineTimeoutSeconds int    `json:"engineTimeoutSeconds"`
	AutoPush     bool           `json:"autoPush"`
	Engines      []EngineConfig `json:"engines"`
}

// ArchiveDir resolves the Archive location: $TAB_WIKI_DIR or ~/tab-wiki.
func ArchiveDir() (string, error) {
	if dir := os.Getenv("TAB_WIKI_DIR"); dir != "" {
		return dir, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}
	return filepath.Join(home, "tab-wiki"), nil
}

func Default() Config {
	return Config{
		ActiveEngine: "claude",
		ActiveModel:  "claude-opus-4-8",
		StaleDays:    60,
		EngineTimeoutSeconds: 300,
		AutoPush:     false,
		Engines: []EngineConfig{
			{
				Name:    "claude",
				Bin:     "claude",
				Args:    []string{"-p", "--model", "{MODEL}"},
				Enabled: true,
				Models: []string{
					"claude-sonnet-5",
					"claude-fable-5",
					"claude-opus-4-8",
					"claude-opus-4-7",
					"claude-sonnet-4-6",
					"claude-opus-4-6",
					"claude-opus-4-5-20251101",
					"claude-haiku-4-5-20251001",
					"claude-sonnet-4-5-20250929",
				},
			},
			{
				Name:    "codex",
				Bin:     "codex",
				Args:    []string{"exec", "--model", "{MODEL}", "{PROMPT}"},
				Enabled: true,
				Models:  []string{"gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"},
			},
			{
				Name:    "opencode",
				Bin:     "opencode",
				Args:    []string{"run", "--model", "{MODEL}", "{PROMPT}"},
				Enabled: false,
				Models:  []string{},
			},
		},
	}
}

func path(archiveDir string) string {
	return filepath.Join(archiveDir, "config.json")
}

// Load reads config.json from the Archive, creating it with defaults if absent.
func Load(archiveDir string) (Config, error) {
	p := path(archiveDir)
	data, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		cfg := Default()
		if err := Save(archiveDir, cfg); err != nil {
			return cfg, err
		}
		return cfg, nil
	}
	if err != nil {
		return Config{}, fmt.Errorf("reading config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parsing %s: %w", p, err)
	}
	if cfg.StaleDays <= 0 {
		cfg.StaleDays = 60
	}
	if cfg.EngineTimeoutSeconds <= 0 {
		cfg.EngineTimeoutSeconds = 300
	}
	return cfg, nil
}

func Save(archiveDir string, cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path(archiveDir), append(data, '\n'), 0o644)
}
