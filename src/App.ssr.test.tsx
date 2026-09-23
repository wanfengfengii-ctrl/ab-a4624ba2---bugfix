// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';

describe('App 组件树冒烟（SSR）', () => {
  it('挂载即渲染编辑器、计算按钮与规则说明，且不抛异常', () => {
    const html = renderToString(<App />);
    expect(html).toContain('多载波卫星测控站改频全局规划工作台');
    expect(html).toContain('开始全局规划');
    expect(html).toContain('保护间隔');
    // 默认载入 3 载波示例
    expect(html).toContain('C1');
    expect(html).toContain('添加载波');
  });
});
