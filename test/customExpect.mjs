import { expect as jestExpect } from '@jest/globals';

const wrapMatcher = (matcher) => (...args) => {
    try {
        return matcher(...args);
    } catch (error) {
        debugger;  // Break on any matcher failure
        throw error;
    }
};

// Create wrapped versions of all matchers
const wrappedExpect = (actual) => {
    const expectation = jestExpect(actual);
    // Wrap all matcher methods
    return new Proxy(expectation, {
        get(target, prop) {
            const original = target[prop];
            if (typeof original === 'function') {
                return wrapMatcher(original.bind(target));
            }
            return original;
        }
    });
};

export default wrappedExpect;