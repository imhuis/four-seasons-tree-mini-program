/** World coordinates: tree root is (0, 0, 0), Y points up. */
export type Three = typeof import('three');

export const PHASE_NAMES: readonly string[] = ['初春', '暮春', '初夏', '盛夏', '初秋', '深秋', '初冬', '寒冬'];
export const SEASON_TITLES: readonly string[] = ['春', '夏', '秋', '冬'];
export const TRUNK_HALF_WIDTH = 0.028;
export const BRANCH_MAX_DEPTH = 5;
export const BRANCH_LIMIT = 110;
export const PARTICLE_POOL_SIZE = 260;
export const GROUND_LEAF_CAPACITY = 48;
export const GROUND_SNOW_CAPACITY = 26;
