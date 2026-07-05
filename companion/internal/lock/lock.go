// Package lock guards the Archive against concurrent mutation. Browsers are
// used serially by design (see ADR 0002), so the lock exists to fail loudly
// if that assumption is ever violated, not to coordinate real concurrency.
package lock

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

const staleAfter = 10 * time.Minute

type Lock struct {
	path string
}

// Acquire takes the Archive lock, stealing it only when the holder is dead
// or the lockfile is older than staleAfter.
func Acquire(archiveDir string) (*Lock, error) {
	p := filepath.Join(archiveDir, ".lock")
	for attempt := 0; attempt < 2; attempt++ {
		f, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err == nil {
			fmt.Fprintf(f, "%d\n", os.Getpid())
			f.Close()
			return &Lock{path: p}, nil
		}
		if !os.IsExist(err) {
			return nil, fmt.Errorf("creating lockfile: %w", err)
		}
		if !isStale(p) {
			return nil, fmt.Errorf("archive is locked by another Companion process (another browser mid-Clean?); if this is wrong, delete %s", p)
		}
		os.Remove(p)
	}
	return nil, fmt.Errorf("could not acquire archive lock at %s", p)
}

func isStale(p string) bool {
	info, err := os.Stat(p)
	if err != nil {
		return true
	}
	if time.Since(info.ModTime()) > staleAfter {
		return true
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return true
	}
	pid, err := strconv.Atoi(string(data[:len(data)-1]))
	if err != nil {
		return true
	}
	// Signal 0 checks process existence without sending anything.
	return syscall.Kill(pid, 0) != nil
}

func (l *Lock) Release() {
	os.Remove(l.path)
}
