import { expect as jestExpect } from '@jest/globals';

type MatcherFunction = (...args: any[]) => any;

const wrapMatcher = (matcher: MatcherFunction): MatcherFunction => (...args: any[]) => {
    try {
        return matcher(...args);
    } catch (error) {
        debugger;  // Break on any matcher failure
        throw error;
    }
};

// Create wrapped versions of all matchers
const wrappedExpect = (actual: any) => {
    const expectation = jestExpect(actual);
    // Wrap all matcher methods
    return new Proxy(expectation, {
        get(target: any, prop: string | symbol): any {
            const original = target[prop as any];
            if (typeof original === 'function') {
                return wrapMatcher(original.bind(target));
            }
            return original;
        }
    });
};

export default wrappedExpect;