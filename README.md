# 多载波卫星测控站改频全局规划工作台

纯前端（React + TypeScript + Vite）工作台：编辑或导入多载波改频模型，
在浏览器本地完成**全局穷举规划**，逐项核对选定频点、改频费用与冲突裕量。
无后端、无网络上报，所有业务计算均在本地（Web Worker）完成。

## 业务规则

- 模型含 **3~10 个唯一编号载波**；每个载波有 **2~6 个**载波内编号唯一的
  **整数 kHz 候选频点**、每个候选带**非负改频费用**，载波另设**首选频点**
  （必须属于本载波候选）；模型设置**正整数保护间隔** G（kHz）。
- 约束一：任意两条已选载波频率距离 `|fi − fj| ≥ G`。
- 约束二：任意**不同**载波 i、j 产生的三阶互调产物 `2fi − fj`，与任意
  第三载波 k（k≠i 且 k≠j）的距离必须 `|2fi − fj − fk| ≥ G`。
  i、j 顺序不同产物不同，两个方向均检查；碰撞报告给出三元组 (i,j,k)
  及产物与第三载波的**实际距离**。
- 规划**完整比较可行组合**（笛卡尔积穷举 + 增量约束剪枝 + 三级安全下界剪枝，
  剪枝只删除被证明不可能更优的分支，结论与全量枚举一致），按序最小化：
  1. 总改频费用；
  2. 相对首选频点的最大偏移 `max |选中 − 首选|`；
  3. 按载波编号（数值感知排序，C2 在 C10 前）排列的频点序列字典序。
- 任何输入变化都会**立即撤下旧结论**；输入有错误时逐字段标红并阻止计算；
  无可行组合时明确提示无解，并给出“逐路最便宜候选”组合的碰撞诊断。

## 本地开发

```bash
npm install
npm test        # Vitest 单元/对照测试（含 300 组随机模型与暴力枚举对照）
npm run dev     # 开发服务器
npm run build   # tsc 类型检查 + 生产构建到 dist/
npm run preview # 预览生产构建
```

## Docker

镜像为多阶段构建：Node 构建静态产物 → nginx 提供纯静态服务。

```bash
# 启动站点（宿主机端口可用 HOST_PORT 配置，默认 8080）
docker compose up -d
# 或自定义端口
HOST_PORT=9090 docker compose up -d

curl http://localhost:8080/healthz   # -> ok
```

- 容器内置 `HEALTHCHECK`（轮询 `/healthz`），Compose 中 `web` 也声明了健康检查。
- `verify` 为**一次性服务**：等待 `web` 健康后依次执行
  1. `npm test` 代码测试；
  2. `npm run build` 类型检查与构建；
  3. `scripts/smoke.sh` 对运行中的站点做 HTTP 冒烟（`/healthz`、首页标题、首页引用的 JS 资源）。

  随后自行退出，并以退出码报告结果（0 全部通过）：

```bash
docker compose up --abort-on-container-exit --exit-code-from verify verify
# 或
docker compose run --rm verify
```

## 导入 JSON 格式

```json
{
  "guardBand": 50,
  "carriers": [
    {
      "id": "C1",
      "preferredFreq": 1000,
      "candidates": [
        { "no": 1, "freq": 1000, "cost": 0 },
        { "no": 2, "freq": 1100, "cost": 30 }
      ]
    }
  ]
}
```

页面支持文件导入、粘贴 JSON 导入与导出，并内置 3/5 载波示例。
