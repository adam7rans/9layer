'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsConfig {
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  disabled?: boolean;
}

export default function useKeyboardShortcuts({
  onPlayPause,
  onNext,
  onPrevious,
  onSeekForward,
  onSeekBackward,
  onVolumeUp,
  onVolumeDown,
  disabled = false
}: KeyboardShortcutsConfig) {
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return;
    
    // Don't trigger shortcuts if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Prevent default behavior for handled keys
    const preventDefault = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    switch (event.code) {
      case 'Space':
        preventDefault();
        onPlayPause?.();
        break;
        
      case 'ArrowRight':
        preventDefault();
        if (event.shiftKey) {
          onNext?.();
        } else {
          onSeekForward?.();
        }
        break;
        
      case 'ArrowLeft':
        preventDefault();
        if (event.shiftKey) {
          onPrevious?.();
        } else {
          onSeekBackward?.();
        }
        break;
        
      case 'ArrowUp':
        preventDefault();
        onVolumeUp?.();
        break;
        
      case 'ArrowDown':
        preventDefault();
        onVolumeDown?.();
        break;
        
      default:
        // Don't prevent default for unhandled keys
        break;
    }
  }, [disabled, onPlayPause, onNext, onPrevious, onSeekForward, onSeekBackward, onVolumeUp, onVolumeDown]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}