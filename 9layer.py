#!/usr/bin/env python3
"""Legacy shim – forwards execution to the refactored `musicplayer` package."""
from musicplayer.cli import main

if __name__ == "__main__":
    main()