/**
 * Hand-seeded catalog of ten gateway courses and taxonomy v1 (backlog item B4).
 * Codes are modeled on the Cal Poly Pomona catalog; confirm them against the
 * current catalog before any real use.
 *
 * Each topic has a tag (what tutors declare and requests carry) and keywords
 * (what the intake parser looks for in free text).
 */
export interface Topic {
  tag: string;
  keywords: string[];
}
export interface Course {
  code: string;
  subject: string;
  number: number;
  title: string;
  topics: Topic[];
}

function course(code: string, title: string, topics: Record<string, string[]>): Course {
  const [subject, num] = code.split(' ');
  return {
    code,
    subject,
    number: Number(num),
    title,
    topics: Object.entries(topics).map(([tag, extra]) => ({
      tag,
      keywords: [tag.replace(/-/g, ' '), ...extra],
    })),
  };
}

export const COURSES: Course[] = [
  course('MAT 1140', 'Calculus I', {
    limits: ['limit', 'continuity'],
    derivatives: ['derivative', 'differentiation', 'product rule', 'quotient rule'],
    'chain-rule': [],
    'related-rates': [],
    optimization: ['max and min', 'maxima', 'minima'],
    'basic-integrals': ['antiderivative', 'riemann sum', 'fundamental theorem'],
  }),
  course('MAT 1150', 'Calculus II', {
    'integration-techniques': ['integration by parts', 'u substitution', 'u-sub', 'partial fractions', 'trig substitution'],
    'improper-integrals': ['improper integral'],
    series: ['convergence test', 'ratio test', 'sequences'],
    'taylor-series': ['maclaurin', 'power series'],
    'integral-applications': ['volume of revolution', 'arc length', 'shell method', 'disk method'],
  }),
  course('MAT 2140', 'Calculus III', {
    vectors: ['dot product', 'cross product', 'vector'],
    'partial-derivatives': ['partial derivative'],
    gradient: ['directional derivative', 'lagrange'],
    'multiple-integrals': ['double integral', 'triple integral'],
    'line-integrals': ['line integral', "green's theorem", 'greens theorem'],
  }),
  course('CHM 1210', 'General Chemistry I', {
    stoichiometry: ['limiting reagent', 'limiting reactant', 'mole ratio', 'moles'],
    'atomic-structure': ['electron configuration', 'orbitals', 'periodic trends'],
    bonding: ['lewis structure', 'vsepr', 'molecular geometry'],
    'gas-laws': ['ideal gas', 'pv=nrt'],
    thermochemistry: ['enthalpy', 'calorimetry', "hess's law", 'hess law'],
  }),
  course('PHY 1510', 'Newtonian Mechanics', {
    kinematics: ['projectile', 'velocity', 'acceleration'],
    'newtons-laws': ["newton's laws", 'free body diagram', 'forces', 'friction'],
    energy: ['work energy', 'conservation of energy', 'potential energy'],
    momentum: ['collision', 'impulse'],
    rotation: ['torque', 'angular momentum', 'moment of inertia'],
  }),
  course('CS 1300', 'Discrete Structures', {
    logic: ['truth table', 'propositional', 'predicate'],
    proofs: ['proof', 'contradiction', 'contrapositive'],
    induction: ['inductive'],
    sets: ['set theory', 'relations'],
    combinatorics: ['counting', 'permutation', 'combination', 'pigeonhole'],
    'graph-basics': ['graph theory'],
  }),
  course('CS 1400', 'Introduction to Programming and Problem Solving', {
    'variables-types': ['variables', 'data types'],
    loops: ['for loop', 'while loop', 'loop'],
    functions: ['methods', 'parameters'],
    arrays: ['array', 'arraylist'],
    recursion: ['recursive'],
    'oop-basics': ['classes', 'objects', 'object oriented', 'inheritance'],
  }),
  course('CS 2400', 'Data Structures and Advanced Programming', {
    'linked-lists': ['linked list'],
    'stacks-queues': ['stack', 'queue'],
    trees: ['binary tree', 'bst', 'binary search tree', 'avl', 'tree traversal'],
    'hash-tables': ['hash table', 'hashmap', 'hash map', 'hashing'],
    heaps: ['heap', 'priority queue'],
    recursion: ['recursive'],
    'big-o': ['big o', 'time complexity', 'runtime analysis'],
  }),
  course('CS 3310', 'Design and Analysis of Algorithms', {
    'dynamic-programming': ['dp', 'memoization', 'knapsack', 'tabulation'],
    greedy: ['greedy algorithm'],
    'divide-and-conquer': ['merge sort', 'quicksort', 'master theorem'],
    'graph-algorithms': ['dijkstra', 'bfs', 'dfs', 'shortest path', 'minimum spanning tree'],
    'complexity-analysis': ['asymptotic', 'np complete', 'np-complete'],
    recurrences: ['recurrence relation', 'recurrence'],
  }),
  course('STA 2260', 'Probability and Statistics for Computer Scientists and Engineers', {
    probability: ['bayes', 'conditional probability'],
    'random-variables': ['random variable', 'expected value', 'variance'],
    distributions: ['normal distribution', 'binomial', 'poisson'],
    'hypothesis-testing': ['hypothesis test', 'p-value', 'p value', 't-test'],
    'confidence-intervals': ['confidence interval'],
    regression: ['linear regression', 'least squares'],
  }),
];

export const ALL_TAGS: ReadonlySet<string> = new Set(COURSES.flatMap((c) => c.topics.map((t) => t.tag)));
export const COURSE_BY_CODE: ReadonlyMap<string, Course> = new Map(COURSES.map((c) => [c.code, c]));
