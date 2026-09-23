import type { PlanModel } from './types';

/** 内置示例：3 载波，保护间隔 50 kHz */
export const SAMPLE_MODEL: PlanModel = {
  guardBand: 50,
  carriers: [
    {
      id: 'C1',
      preferredFreq: 1000,
      candidates: [
        { no: 1, freq: 1000, cost: 0 },
        { no: 2, freq: 1100, cost: 30 },
        { no: 3, freq: 1200, cost: 60 },
      ],
    },
    {
      id: 'C2',
      preferredFreq: 1060,
      candidates: [
        { no: 1, freq: 1060, cost: 0 },
        { no: 2, freq: 1150, cost: 20 },
        { no: 3, freq: 1250, cost: 50 },
      ],
    },
    {
      id: 'C3',
      preferredFreq: 1300,
      candidates: [
        { no: 1, freq: 1300, cost: 0 },
        { no: 2, freq: 940, cost: 40 },
        { no: 3, freq: 1400, cost: 70 },
      ],
    },
  ],
};

/** 更大的 5 载波示例 */
export const LARGE_SAMPLE_MODEL: PlanModel = {
  guardBand: 30,
  carriers: [
    {
      id: 'C1',
      preferredFreq: 2000,
      candidates: [
        { no: 1, freq: 2000, cost: 0 },
        { no: 2, freq: 2100, cost: 10 },
        { no: 3, freq: 2200, cost: 20 },
        { no: 4, freq: 2300, cost: 30 },
      ],
    },
    {
      id: 'C2',
      preferredFreq: 2050,
      candidates: [
        { no: 1, freq: 2050, cost: 0 },
        { no: 2, freq: 2160, cost: 15 },
        { no: 3, freq: 2270, cost: 25 },
        { no: 4, freq: 2400, cost: 40 },
      ],
    },
    {
      id: 'C3',
      preferredFreq: 2500,
      candidates: [
        { no: 1, freq: 2500, cost: 0 },
        { no: 2, freq: 2600, cost: 12 },
        { no: 3, freq: 2700, cost: 24 },
      ],
    },
    {
      id: 'C4',
      preferredFreq: 2800,
      candidates: [
        { no: 1, freq: 2800, cost: 0 },
        { no: 2, freq: 1900, cost: 35 },
        { no: 3, freq: 2900, cost: 18 },
        { no: 4, freq: 3000, cost: 28 },
      ],
    },
    {
      id: 'C5',
      preferredFreq: 3100,
      candidates: [
        { no: 1, freq: 3100, cost: 0 },
        { no: 2, freq: 3200, cost: 22 },
        { no: 3, freq: 1850, cost: 50 },
      ],
    },
  ],
};
