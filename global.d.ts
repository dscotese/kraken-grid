declare global {
  namespace NodeJS {
    interface Process {
      TESTING?: boolean;  // or whatever type you use
      USECACHE?: 'G' | 'K' | 'must' | string;  // based on your usage in bot.ts
      // Add other properties you set on process
    }
  }
}
declare module 'prompt-sync';
export {}
