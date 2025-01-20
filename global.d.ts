/*
namespace NodeJS {
  interface Process {
    TESTING?: boolean;  // or whatever type you use
    USECACHE?: 'G' | 'K' | 'must' | string;  // based on your usage in bot.ts
    // Add other properties you set on process
  }
} */
/// <reference types="node" />

// First approach (WSL-friendly)
declare global {
  namespace NodeJS {
    interface Process {
      TESTING?: boolean;
      USECACHE?: 'G' | 'K' | 'must' | string;
    }
  }
}
// Second approach (VSCode-friendly)
declare global {
  var process: NodeJS.Process & {
    TESTING?: boolean;
    USECACHE?: 'G' | 'K' | 'must' | string;
  };
}
declare module 'prompt-sync';
export {} // would make this a module, not in global scope.
