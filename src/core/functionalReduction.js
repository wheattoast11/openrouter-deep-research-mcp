/**
 * Functional Reduction - Lambda Calculus Task Decomposition
 * 
 * Pure functional primitives for task decomposition and composition.
 * Inspired by lambda calculus and category theory.
 * 
 * Core principles:
 * - Functions are first-class values
 * - Composition over inheritance
 * - Immutable transformations
 * - Referential transparency
 * 
 * @module core/functionalReduction
 */

/**
 * Function composition: (f ∘ g)(x) = f(g(x))
 * 
 * Combines two functions into a single function that applies them in sequence.
 * 
 * @param {Function} f - Outer function
 * @param {Function} g - Inner function
 * @returns {Function} Composed function
 * 
 * @example
 * const addOne = x => x + 1;
 * const double = x => x * 2;
 * const addOneThenDouble = compose(double, addOne);
 * addOneThenDouble(3); // => 8
 */
function compose(f, g) {
  return async function composed(...args) {
    const gResult = await (typeof g === 'function' ? g(...args) : g);
    return await f(gResult);
  };
}

/**
 * Pipe: Left-to-right function composition
 * 
 * More intuitive than compose for reading left-to-right.
 * 
 * @param {...Function} fns - Functions to pipe
 * @returns {Function} Piped function
 * 
 * @example
 * const result = await pipe(
 *   parse,
 *   validate,
 *   transform,
 *   execute
 * )(input);
 */
function pipe(...fns) {
  return async function piped(initialValue) {
    let result = initialValue;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

/**
 * Curry: Convert function to accept arguments one at a time
 * 
 * Enables partial application and function specialization.
 * 
 * @param {Function} fn - Function to curry
 * @param {number} arity - Number of arguments (default: fn.length)
 * @returns {Function} Curried function
 * 
 * @example
 * const add = (a, b, c) => a + b + c;
 * const curriedAdd = curry(add);
 * const add5 = curriedAdd(5);
 * add5(3)(2); // => 10
 */
function curry(fn, arity = fn.length) {
  return function curried(...args) {
    if (args.length >= arity) {
      return fn(...args);
    }
    return (...nextArgs) => curried(...args, ...nextArgs);
  };
}

/**
 * Reduce: Sequential reduction with accumulator
 * 
 * Fold a list of values into a single result using a reducer function.
 * 
 * @param {Array} tasks - Array of tasks/values
 * @param {Function} reducer - Reducer function (acc, task) => newAcc
 * @param {*} initialValue - Initial accumulator value
 * @returns {Promise<*>} Final accumulated value
 * 
 * @example
 * const sum = await reduce(
 *   [1, 2, 3, 4],
 *   (acc, n) => acc + n,
 *   0
 * ); // => 10
 */
async function reduce(tasks, reducer, initialValue) {
  let accumulator = initialValue;
  
  for (const task of tasks) {
    accumulator = await reducer(accumulator, task);
  }
  
  return accumulator;
}

/**
 * Parallel: Execute tasks in parallel with synchronization barrier
 * 
 * All tasks run concurrently, results collected when all complete.
 * 
 * @param {Array<Function>} tasks - Array of async functions
 * @param {Object} options - Parallel execution options
 * @param {number} options.maxConcurrency - Max concurrent tasks (default: unlimited)
 * @param {boolean} options.failFast - Stop on first error (default: false)
 * @returns {Promise<Array>} Array of results
 * 
 * @example
 * const results = await parallel([
 *   () => fetchData(1),
 *   () => fetchData(2),
 *   () => fetchData(3)
 * ], { maxConcurrency: 2 });
 */
async function parallel(tasks, options = {}) {
  const { maxConcurrency = Infinity, failFast = false } = options;
  
  if (maxConcurrency === Infinity) {
    // Unlimited concurrency
    if (failFast) {
      return await Promise.all(tasks.map(t => typeof t === 'function' ? t() : t));
    } else {
      return await Promise.allSettled(tasks.map(t => typeof t === 'function' ? t() : t));
    }
  }
  
  // Bounded concurrency
  const results = [];
  const executing = new Set();
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const promise = (async () => {
      try {
        const result = await (typeof task === 'function' ? task() : task);
        results[i] = { status: 'fulfilled', value: result };
      } catch (error) {
        if (failFast) throw error;
        results[i] = { status: 'rejected', reason: error };
      }
    })();
    
    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    
    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Map: Transform each element with a function
 * 
 * @param {Array} items - Items to transform
 * @param {Function} fn - Transform function
 * @returns {Promise<Array>} Transformed items
 */
async function map(items, fn) {
  const results = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}

/**
 * Filter: Keep only items that satisfy predicate
 * 
 * @param {Array} items - Items to filter
 * @param {Function} predicate - Predicate function
 * @returns {Promise<Array>} Filtered items
 */
async function filter(items, predicate) {
  const results = [];
  for (const item of items) {
    if (await predicate(item)) {
      results.push(item);
    }
  }
  return results;
}

/**
 * Memoize: Cache function results
 * 
 * @param {Function} fn - Function to memoize
 * @param {Function} keyFn - Key generation function (default: JSON.stringify)
 * @returns {Function} Memoized function
 */
function memoize(fn, keyFn = JSON.stringify) {
  const cache = new Map();
  
  return async function memoized(...args) {
    const key = keyFn(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Retry: Retry function on failure with exponential backoff
 * 
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Max retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 100)
 * @param {number} options.maxDelay - Max delay in ms (default: 5000)
 * @param {Function} options.shouldRetry - Predicate for retryable errors
 * @returns {Function} Retryable function
 */
function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 5000,
    shouldRetry = () => true
  } = options;
  
  return async function retryable(...args) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
}

/**
 * Debounce: Delay function execution until after delay
 * 
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timeoutId = null;
  
  return function debounced(...args) {
    clearTimeout(timeoutId);
    
    return new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        resolve(await fn(...args));
      }, delay);
    });
  };
}

/**
 * Throttle: Limit function execution rate
 * 
 * @param {Function} fn - Function to throttle
 * @param {number} interval - Min interval in ms
 * @returns {Function} Throttled function
 */
function throttle(fn, interval) {
  let lastCall = 0;
  let timeoutId = null;
  
  return async function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= interval) {
      lastCall = now;
      return await fn(...args);
    }
    
    // Queue call for later
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        lastCall = Date.now();
        resolve(await fn(...args));
      }, interval - timeSinceLastCall);
    });
  };
}

/**
 * Identity: Return input unchanged (useful for composition)
 * 
 * @param {*} x - Input value
 * @returns {*} Same value
 */
function identity(x) {
  return x;
}

/**
 * Constant: Always return the same value
 * 
 * @param {*} value - Value to return
 * @returns {Function} Function that always returns value
 */
function constant(value) {
  return () => value;
}

/**
 * Tap: Execute side effect without modifying value
 * 
 * Useful for debugging in pipelines.
 * 
 * @param {Function} fn - Side effect function
 * @returns {Function} Function that executes side effect and returns input
 * 
 * @example
 * const result = await pipe(
 *   parse,
 *   tap(x => console.log('Parsed:', x)),
 *   validate,
 *   tap(x => console.log('Validated:', x)),
 *   execute
 * )(input);
 */
function tap(fn) {
  return async function tapped(value) {
    await fn(value);
    return value;
  };
}

/**
 * Branch: Conditional execution based on predicate
 * 
 * @param {Function} predicate - Condition function
 * @param {Function} thenFn - Function to execute if true
 * @param {Function} elseFn - Function to execute if false (default: identity)
 * @returns {Function} Branching function
 * 
 * @example
 * const process = branch(
 *   isValid,
 *   doComplexProcessing,
 *   doSimpleProcessing
 * );
 */
function branch(predicate, thenFn, elseFn = identity) {
  return async function branched(value) {
    const condition = await predicate(value);
    return condition ? await thenFn(value) : await elseFn(value);
  };
}

/**
 * Waterfall: Sequential execution with accumulation
 * 
 * Each function receives result of previous function.
 * 
 * @param {Array<Function>} fns - Functions to execute
 * @param {*} initialValue - Starting value
 * @returns {Promise<*>} Final result
 */
async function waterfall(fns, initialValue) {
  let result = initialValue;
  
  for (const fn of fns) {
    result = await fn(result);
  }
  
  return result;
}

/**
 * Race: Return first resolved result
 * 
 * @param {Array<Function>} tasks - Tasks to race
 * @returns {Promise<*>} First resolved result
 */
async function race(tasks) {
  return await Promise.race(tasks.map(t => typeof t === 'function' ? t() : t));
}

/**
 * All: Wait for all tasks to complete
 * 
 * @param {Array<Function>} tasks - Tasks to wait for
 * @returns {Promise<Array>} All results
 */
async function all(tasks) {
  return await Promise.all(tasks.map(t => typeof t === 'function' ? t() : t));
}

/**
 * Sequential: Execute tasks in sequence (alias for waterfall)
 * 
 * @param {Array<Function>} tasks - Tasks to execute
 * @param {*} initialValue - Starting value
 * @returns {Promise<*>} Final result
 */
async function sequential(tasks, initialValue) {
  return await waterfall(tasks, initialValue);
}

module.exports = {
  // Core combinators
  compose,
  pipe,
  curry,
  
  // Collection operations
  reduce,
  parallel,
  map,
  filter,
  
  // Optimization
  memoize,
  retry,
  debounce,
  throttle,
  
  // Utilities
  identity,
  constant,
  tap,
  branch,
  
  // Control flow
  waterfall,
  race,
  all,
  sequential
};


