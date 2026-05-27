import { OrgChart } from 'd3-org-chart';
import { NODE_WIDTH, nodeHeight, renderNode } from './nodeTemplate.js';

// Build the top-down collapsible org chart. The flat data (id/parentId) is
// stratified internally by d3-org-chart.
export function createChart(container, data) {
  return new OrgChart()
    .container(container)
    .data(data)
    .layout('top')
    .compact(false)
    .nodeWidth(() => NODE_WIDTH)
    .nodeHeight((d) => nodeHeight(d.data))
    .childrenMargin(() => 60)
    .siblingsMargin(() => 30)
    .neighbourMargin(() => 40)
    .nodeContent((d) => renderNode(d.data))
    .render();
}
