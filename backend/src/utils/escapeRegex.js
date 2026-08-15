// A raw user-supplied string dropped straight into a MongoDB $regex is a
// real risk: characters like `.*` change what the query matches, and a
// crafted pattern can cause catastrophic backtracking (ReDoS). Escaping
// every regex special character makes the input a literal string again.
export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
