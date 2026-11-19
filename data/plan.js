/* 2007–2026 真题计划骨架（仅元数据，不含受版权保护的原文） */
(function () {
  var plan = [];
  var y, t;
  for (y = 2007; y <= 2026; y++) {
    for (t = 1; t <= 4; t++) {
      plan.push({ id: 'y' + y + '-t' + t, year: y, exam: '英语一', type: 'reading', label: 'Text ' + t });
    }
  }
  for (y = 2010; y <= 2026; y++) {
    for (t = 1; t <= 4; t++) {
      plan.push({ id: 'e2-' + y + '-t' + t, year: y, exam: '英语二', type: 'reading', label: 'Text ' + t });
    }
  }
  window.KY_PLAN = plan;
})();
