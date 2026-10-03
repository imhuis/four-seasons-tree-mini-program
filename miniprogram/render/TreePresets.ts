import { rgb, type RGB } from '../utils/color';

export type LeafShape = 'oval' | 'maple' | 'star' | 'fan' | 'needle';
export type CrownShape = 'round' | 'column' | 'conifer' | 'vase';
export type BarkStyle = 'plain' | 'birch' | 'mottled';
export type FruitShape = 'none' | 'ball' | 'persimmon' | 'capsule' | 'bud';

export interface TreePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  seasons: readonly [string, string, string, string];
  crown: CrownShape;
  spread: number;
  trunkHeight: number;
  leafShape: LeafShape;
  leafSize: number;
  leafDensity: number;
  leafColors: readonly RGB[];
  autumnVariation: number;
  flowerCurve: readonly number[];
  flowerColor: RGB;
  flowerSize: number;
  flowerDensity: number;
  flowerPetals: number;
  fruitShape: FruitShape;
  fruitCurve: readonly number[];
  fruitColor: RGB;
  bark: BarkStyle;
  trunkColor: RGB;
}

const NO_BLOOM = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const SPRING_BLOOM = [0.3, 1, 0, 0, 0, 0, 0, 0, 0.3];
const NO_FRUIT = NO_BLOOM;
const base: Omit<TreePreset, 'id' | 'name' | 'icon' | 'description' | 'seasons' | 'leafColors'> = {
  crown: 'round', spread: 0.70, trunkHeight: 0.28,
  leafShape: 'oval', leafSize: 1, leafDensity: 14, autumnVariation: 0,
  flowerCurve: NO_BLOOM, flowerColor: rgb('#F3C6CE'), flowerSize: 1, flowerDensity: 0, flowerPetals: 5,
  fruitShape: 'none', fruitCurve: NO_FRUIT, fruitColor: rgb('#BD7A43'),
  bark: 'plain', trunkColor: rgb('#6B5340'),
};

// Nine stops align with the eight seasonal phases; first and last are identical.
function palette(spring: string, summer: string, autumn: string, late: string, winter = late): RGB[] {
  return [spring, spring, summer, summer, autumn, late, winter, winter, spring].map(rgb);
}

export const TREE_PRESETS: readonly TreePreset[] = [
  { ...base, id: 'sakura', name: '樱花', icon: '🌸', description: '春日粉白花海，秋日暖色落叶',
    seasons: ['粉白花海', '浓绿成荫', '黄橙红叶', '静谧裸枝'],
    leafColors: palette('#A9CE84', '#39713C', '#D7A64A', '#BF582F'),
    flowerCurve: SPRING_BLOOM, flowerColor: rgb('#F9CCD9'), flowerDensity: 0.95, flowerSize: 1.35, spread: 0.82 },
  { ...base, id: 'japanese-maple', name: '日本红枫', icon: '🍁', description: '掌状红嫩叶，秋色鲜红橙黄',
    seasons: ['红色嫩叶', '红绿交织', '鲜红橙黄', '纤细裸枝'],
    leafColors: palette('#B94453', '#526B3A', '#E77E29', '#D52E31'),
    leafShape: 'maple', leafSize: 1.05, spread: 0.92, trunkHeight: 0.23, autumnVariation: 0.8 },
  { ...base, id: 'ginkgo', name: '银杏', icon: '🟡', description: '扇形叶片由嫩绿转为金黄',
    seasons: ['嫩绿新叶', '绿色扇叶', '满树金黄', '疏朗裸枝'],
    leafColors: palette('#BCD878', '#578C46', '#EBCF38', '#E6B82D'),
    leafShape: 'fan', crown: 'column', spread: 0.5, trunkHeight: 0.4, leafSize: 1.25 },
  { ...base, id: 'sweetgum', name: '美国枫香', icon: '🍂', description: '星形叶片，秋季多彩，冬季果球留枝',
    seasons: ['嫩绿新叶', '浓绿星叶', '红橙黄紫', '裸枝与果球'],
    leafColors: palette('#A1CC79', '#35724B', '#C7A448', '#A33255'),
    leafShape: 'star', crown: 'column', spread: 0.64, autumnVariation: 1,
    fruitShape: 'ball', fruitCurve: [0.25, 0, 0.05, 0.25, 0.65, 1, 1, 0.65, 0.25], fruitColor: rgb('#76503A') },
  { ...base, id: 'crape-myrtle', name: '紫薇', icon: '🌺', description: '夏季簇状花朵与光滑斑驳树皮',
    seasons: ['枝头发芽', '夏花盛放', '黄橙红叶', '斑驳树干'],
    leafColors: palette('#A8CD7B', '#497C3D', '#D6AE48', '#B86138'),
    crown: 'vase', bark: 'mottled', trunkColor: rgb('#B7997D'), trunkHeight: 0.22,
    flowerCurve: [0, 0, 0.45, 1, 0.25, 0, 0, 0, 0], flowerColor: rgb('#E56AB0'), flowerDensity: 0.85, flowerSize: 1.2, flowerPetals: 6 },
  { ...base, id: 'persimmon', name: '柿子树', icon: '🍊', description: '秋日橙红叶，冬季落叶挂果',
    seasons: ['发芽开花', '浓绿树冠', '橙红叶与果实', '落叶挂果'],
    leafColors: palette('#A5CE76', '#387048', '#D89642', '#BE4930'),
    leafSize: 1.3, flowerCurve: [0, 0.4, 0.08, 0, 0, 0, 0, 0, 0], flowerColor: rgb('#E9DCAD'), flowerDensity: 0.45,
    fruitShape: 'persimmon', fruitCurve: [0, 0, 0.08, 0.2, 0.6, 1, 1, 0.75, 0], fruitColor: rgb('#F58A28') },
  { ...base, id: 'bald-cypress', name: '落羽杉', icon: '🌲', description: '羽状细叶，秋季铜红，冬季落叶',
    seasons: ['浅绿嫩叶', '深绿羽叶', '铜红棕红', '落叶裸枝'],
    leafColors: palette('#B0D887', '#326B45', '#B87141', '#965236'),
    crown: 'conifer', leafShape: 'needle', leafDensity: 24, leafSize: 0.95, spread: 0.75, trunkHeight: 1 },
  { ...base, id: 'dawn-redwood', name: '水杉', icon: '🌲', description: '挺拔塔形树冠，秋季橙褐细叶',
    seasons: ['嫩绿细叶', '翠绿树冠', '橙褐秋叶', '挺拔裸枝'],
    leafColors: palette('#99D785', '#338259', '#CC904C', '#AF6441'),
    crown: 'conifer', leafShape: 'needle', leafDensity: 22, leafSize: 0.85, spread: 0.55, trunkHeight: 1 },
  { ...base, id: 'birch', name: '白桦', icon: '🌳', description: '金黄秋叶与四季可见的白色树干',
    seasons: ['柔绿嫩叶', '绿色树冠', '金黄秋叶', '白色树干'],
    leafColors: palette('#B6D98C', '#5A9149', '#E6CB52', '#CFA13D'),
    bark: 'birch', trunkColor: rgb('#E3DDD0'), crown: 'column', spread: 0.48, trunkHeight: 0.45, leafSize: 0.85 },
  { ...base, id: 'plum', name: '梅花', icon: '🌸', description: '冬末早春绽放，花先于叶',
    seasons: ['早春梅花', '绿色树冠', '黄叶渐落', '冬季花枝'],
    leafColors: palette('#BCD786', '#427645', '#D4BB58', '#BA8C41'),
    crown: 'vase', spread: 0.85, trunkHeight: 0.2,
    flowerCurve: [0.9, 0.3, 0, 0, 0, 0, 0.15, 1, 0.9], flowerColor: rgb('#EB8FAC'), flowerDensity: 0.9, flowerSize: 1.15 },
  { ...base, id: 'magnolia', name: '玉兰', icon: '🌼', description: '春季大型花朵，冬季保留饱满枝芽',
    seasons: ['大型春花', '浓绿阔叶', '黄褐落叶', '枝芽明显'],
    leafColors: palette('#B8D292', '#3E7247', '#CEB267', '#9B774A'),
    leafSize: 1.55, flowerCurve: SPRING_BLOOM, flowerColor: rgb('#F9E8EB'), flowerDensity: 0.65, flowerSize: 2.2, flowerPetals: 6,
    fruitShape: 'bud', fruitCurve: [0.4, 0, 0, 0, 0.1, 0.2, 0.6, 1, 0.4], fruitColor: rgb('#9F8C74') },
  { ...base, id: 'golden-rain', name: '栾树', icon: '🌰', description: '黄色花簇与秋季红色蒴果',
    seasons: ['黄色花簇', '绿色树冠', '红蒴果与黄叶', '疏朗裸枝'],
    leafColors: palette('#ABD27E', '#4D8145', '#DDC05C', '#C59A45'),
    flowerCurve: [0.1, 0.8, 0.1, 0, 0, 0, 0, 0, 0.1], flowerColor: rgb('#F3D15B'), flowerDensity: 0.75, flowerSize: 0.8,
    fruitShape: 'capsule', fruitCurve: [0, 0, 0, 0.15, 0.8, 1, 0.25, 0, 0], fruitColor: rgb('#D8847F') },
];

export const DEFAULT_TREE_PRESET = TREE_PRESETS[0];

export function treePresetById(id: string): TreePreset | undefined {
  return TREE_PRESETS.find(preset => preset.id === id);
}
