/* 内置示例：均为原创短文，仅用于演示数据结构与练习流程 */
(function () {
  window.KY_DEMO = [
    {
      id: 'demo-slow-morning',
      year: 0,
      exam: '示例',
      type: 'reading',
      title: '示例 · 慢早晨的价值',
      subtitle: '原创示范 · 约 150 词 · 2 题',
      passage:
        'Modern life rewards speed. We answer messages while walking, eat lunch while working, and measure a good day by how many tasks we finish. Yet a growing number of researchers argue that the most valuable part of the day may be the part we are least tempted to protect: the first hour after waking.\n\n' +
        'A slow morning is not about doing nothing. It is about doing one thing at a time. When people begin the day without a screen, they report clearer attention and less anxiety. The reason is simple: the mind needs a period of low stimulation before it can settle into deep work. A rushed morning, by contrast, fills the brain with small decisions before the important ones have been made.\n\n' +
        'This does not require an elaborate routine. Ten quiet minutes, a notebook, and a cup of tea are enough. The point is not to perform calmness for others, but to give attention a place to land.',
      questions: [
        {
          id: 'dq1',
          stem: 'What does the author say about a slow morning?',
          options: [
            { label: 'A', text: 'It means avoiding all tasks.' },
            { label: 'B', text: 'It helps the mind prepare for focused work.' },
            { label: 'C', text: 'It requires expensive habits.' },
            { label: 'D', text: 'It is only useful for artists.' }
          ],
          answer: 'B',
          explanation: '第二段指出：早晨不看屏幕的人注意力更清晰、焦虑更少，且“the mind needs a period of low stimulation before it can settle into deep work”，即帮助大脑进入专注状态。A、C、D 均为绝对化或无中生有。'
        },
        {
          id: 'dq2',
          stem: 'The phrase “a place to land” in the last paragraph most nearly means',
          options: [
            { label: 'A', text: 'a reason to rest' },
            { label: 'B', text: 'a moment of recognition' },
            { label: 'C', text: 'a chance to focus' },
            { label: 'D', text: 'a space for socializing' }
          ],
          answer: 'C',
          explanation: '前文反复强调“attention（注意力）”，末句“give attention a place to land”意为给注意力一个落脚点，即获得专注的机会。'
        }
      ]
    },
    {
      id: 'demo-city-birds',
      year: 0,
      exam: '示例',
      type: 'reading',
      title: '示例 · 城市为什么需要鸟',
      subtitle: '原创示范 · 约 140 词 · 2 题',
      passage:
        'Cities were once described as places where nature had been removed. Today, ecologists tell a different story. Parks, rooftops, railway edges and even cracks in the pavement form a patchwork of habitats that supports a surprising variety of birds.\n\n' +
        'The birds that thrive are rarely the rarest ones. They tend to be flexible: they eat many kinds of food, nest in unusual places, and tolerate the noise and light that cities produce. Their success is a reminder that adaptation is not a single skill but a set of small adjustments.\n\n' +
        'For city planners, the lesson is practical. A single large park is useful, but a network of small green spaces is often better, because it allows birds to move safely between feeding and nesting areas. The design of a city, in other words, is also a form of environmental policy.',
      questions: [
        {
          id: 'dq3',
          stem: 'According to the text, birds that do well in cities are usually',
          options: [
            { label: 'A', text: 'rare species protected by law' },
            { label: 'B', text: 'able to adjust to many conditions' },
            { label: 'C', text: 'dependent on a single food source' },
            { label: 'D', text: 'unwilling to nest near people' }
          ],
          answer: 'B',
          explanation: '第二段用 flexible、eat many kinds of food、nest in unusual places、tolerate noise and light 说明其适应力强，B 是概括。A 与“rarely the rarest ones”相反；C、D 与原文相反。'
        },
        {
          id: 'dq4',
          stem: 'The author suggests that city planners should',
          options: [
            { label: 'A', text: 'build one very large park' },
            { label: 'B', text: 'remove trees from railway edges' },
            { label: 'C', text: 'connect small green spaces' },
            { label: 'D', text: 'reduce the number of birds' }
          ],
          answer: 'C',
          explanation: '末段明确说 “a network of small green spaces is often better”，network 即“相互连接的小型绿地”，对应 C。A 是原文承认“有用”但非最佳方案。'
        }
      ]
    }
  ];
})();
