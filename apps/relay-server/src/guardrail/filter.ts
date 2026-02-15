import type { Language } from '../types.js';
import { containsBannedWord, applyFormalCorrections } from './dictionary.js';

export interface FilterResult {
  passed: boolean;
  issues: FilterIssue[];
  corrected?: string;
}

export interface FilterIssue {
  type: 'banned_word' | 'informal_speech' | 'inappropriate_tone';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Rule-based filter for translated text.
 * Checks for banned words, informal speech, and inappropriate tone.
 */
export function filterText(text: string, language: Language): FilterResult {
  const issues: FilterIssue[] = [];
  let corrected = text;

  // Check banned words (high severity)
  if (containsBannedWord(text, language)) {
    issues.push({
      type: 'banned_word',
      severity: 'high',
      description: 'Text contains banned/profane words',
    });
    // For banned words, we don't attempt correction — needs LLM
    return { passed: false, issues };
  }

  // Check informal speech patterns (medium severity)
  const formalResult = applyFormalCorrections(text, language);
  if (formalResult.wasChanged) {
    issues.push({
      type: 'informal_speech',
      severity: 'medium',
      description: 'Text contains informal speech patterns',
    });
    corrected = formalResult.corrected;
  }

  // Check for Korean-specific tone issues
  if (language === 'ko') {
    // Check if sentence ending is too blunt (no polite suffix)
    if (text.length > 5 && /[가-힣]$/.test(text) && !/[요니다세]$/.test(text)) {
      issues.push({
        type: 'inappropriate_tone',
        severity: 'low',
        description: 'Sentence may lack polite ending',
      });
    }
  }

  const passed = issues.every((i) => i.severity !== 'high');

  return {
    passed,
    issues,
    corrected: corrected !== text ? corrected : undefined,
  };
}
