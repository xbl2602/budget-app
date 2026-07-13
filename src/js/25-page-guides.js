/* ============================================================
   PAGE GUIDES
   ============================================================ */
(function() {
'use strict';

const PAGE_GUIDES = {
  overview: {
    title: __('guide.overview.title'),
    simple: {
      content: [
        {
          heading: __('guide.overview.simple.heading1'),
          text: __('guide.overview.simple.text1')
        },
        {
          heading: __('guide.overview.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.overview.simple.item2_1'),
            __('guide.overview.simple.item2_2'),
            __('guide.overview.simple.item2_3')
          ]
        },
        {
          heading: __('guide.overview.simple.heading3'),
          isTips: true,
          items: [
            __('guide.overview.simple.tip3_1'),
            __('guide.overview.simple.tip3_2'),
            __('guide.overview.simple.tip3_3')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.overview.detailed.heading1'),
          text: __('guide.overview.detailed.text1')
        },
        {
          heading: __('guide.overview.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.overview.detailed.grid2_0_label'), __('guide.overview.detailed.grid2_0_desc')],
            [__('guide.overview.detailed.grid2_1_label'), __('guide.overview.detailed.grid2_1_desc')],
            [__('guide.overview.detailed.grid2_2_label'), __('guide.overview.detailed.grid2_2_desc')],
            [__('guide.overview.detailed.grid2_3_label'), __('guide.overview.detailed.grid2_3_desc')],
            [__('guide.overview.detailed.grid2_4_label'), __('guide.overview.detailed.grid2_4_desc')],
            [__('guide.overview.detailed.grid2_5_label'), __('guide.overview.detailed.grid2_5_desc')],
            [__('guide.overview.detailed.grid2_6_label'), __('guide.overview.detailed.grid2_6_desc')],
            [__('guide.overview.detailed.grid2_7_label'), __('guide.overview.detailed.grid2_7_desc')],
            [__('guide.overview.detailed.grid2_8_label'), __('guide.overview.detailed.grid2_8_desc')],
            [__('guide.overview.detailed.grid2_9_label'), __('guide.overview.detailed.grid2_9_desc')],
            [__('guide.overview.detailed.grid2_10_label'), __('guide.overview.detailed.grid2_10_desc')],
            [__('guide.overview.detailed.grid2_11_label'), __('guide.overview.detailed.grid2_11_desc')],
            [__('guide.overview.detailed.grid2_12_label'), __('guide.overview.detailed.grid2_12_desc')],
          ]
        },
        {
          heading: __('guide.overview.detailed.heading3'),
          text: __('guide.overview.detailed.text3')
        },
        {
          heading: __('guide.overview.detailed.heading4'),
          isOrdered: true,
          items: [
            __('guide.overview.detailed.item4_1'),
            __('guide.overview.detailed.item4_2'),
            __('guide.overview.detailed.item4_3'),
          ]
        },
        {
          heading: __('guide.overview.detailed.heading5'),
          isTable: true,
          rows: [
            [__('guide.overview.detailed.row5_0_label'), __('guide.overview.detailed.row5_0_desc')],
            [__('guide.overview.detailed.row5_1_label'), __('guide.overview.detailed.row5_1_desc')],
            [__('guide.overview.detailed.row5_2_label'), __('guide.overview.detailed.row5_2_desc')],
            [__('guide.overview.detailed.row5_3_label'), __('guide.overview.detailed.row5_3_desc')],
            [__('guide.overview.detailed.row5_4_label'), __('guide.overview.detailed.row5_4_desc')],
            [__('guide.overview.detailed.row5_5_label'), __('guide.overview.detailed.row5_5_desc')],
          ]
        },
        {
          heading: __('guide.overview.detailed.heading6'),
          isTips: true,
          items: [
            __('guide.overview.detailed.tip6_1'),
            __('guide.overview.detailed.tip6_2'),
            __('guide.overview.detailed.tip6_3'),
            __('guide.overview.detailed.tip6_4'),
          ]
        }
      ]
    }
  },

  add: {
    title: __('guide.add.title'),
    simple: {
      content: [
        {
          heading: __('guide.add.simple.heading1'),
          text: __('guide.add.simple.text1')
        },
        {
          heading: __('guide.add.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.add.simple.item2_1'),
            __('guide.add.simple.item2_2'),
            __('guide.add.simple.item2_3'),
            __('guide.add.simple.item2_4'),
            __('guide.add.simple.item2_5')
          ]
        },
        {
          heading: __('guide.add.simple.heading3'),
          isTips: true,
          items: [
            __('guide.add.simple.tip3_1'),
            __('guide.add.simple.tip3_2')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.add.detailed.heading1'),
          text: __('guide.add.detailed.text1')
        },
        {
          heading: __('guide.add.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.add.detailed.grid2_0_label'), __('guide.add.detailed.grid2_0_desc')],
            [__('guide.add.detailed.grid2_1_label'), __('guide.add.detailed.grid2_1_desc')],
            [__('guide.add.detailed.grid2_2_label'), __('guide.add.detailed.grid2_2_desc')],
            [__('guide.add.detailed.grid2_3_label'), __('guide.add.detailed.grid2_3_desc')],
            [__('guide.add.detailed.grid2_4_label'), __('guide.add.detailed.grid2_4_desc')],
            [__('guide.add.detailed.grid2_5_label'), __('guide.add.detailed.grid2_5_desc')],
          ]
        },
        {
          heading: __('guide.add.detailed.heading3'),
          isOrdered: true,
          items: [
            __('guide.add.detailed.item3_1'),
            __('guide.add.detailed.item3_2'),
            __('guide.add.detailed.item3_3'),
            __('guide.add.detailed.item3_4'),
            __('guide.add.detailed.item3_5'),
            __('guide.add.detailed.item3_6'),
            __('guide.add.detailed.item3_7'),
          ]
        },
        {
          heading: __('guide.add.detailed.heading4'),
          isTable: true,
          rows: [
            [__('guide.add.detailed.row4_0_label'), __('guide.add.detailed.row4_0_desc')],
            [__('guide.add.detailed.row4_1_label'), __('guide.add.detailed.row4_1_desc')],
            [__('guide.add.detailed.row4_2_label'), __('guide.add.detailed.row4_2_desc')],
            [__('guide.add.detailed.row4_3_label'), __('guide.add.detailed.row4_3_desc')],
            [__('guide.add.detailed.row4_4_label'), __('guide.add.detailed.row4_4_desc')],
            [__('guide.add.detailed.row4_5_label'), __('guide.add.detailed.row4_5_desc')],
          ]
        },
        {
          heading: __('guide.add.detailed.heading5'),
          isTips: true,
          items: [
            __('guide.add.detailed.tip5_1'),
            __('guide.add.detailed.tip5_2'),
            __('guide.add.detailed.tip5_3'),
            __('guide.add.detailed.tip5_4'),
            __('guide.add.detailed.tip5_5'),
            __('guide.add.detailed.tip5_6'),
          ]
        }
      ]
    }
  },

  records: {
    title: __('guide.records.title'),
    simple: {
      content: [
        {
          heading: __('guide.records.simple.heading1'),
          text: __('guide.records.simple.text1')
        },
        {
          heading: __('guide.records.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.records.simple.item2_1'),
            __('guide.records.simple.item2_2'),
            __('guide.records.simple.item2_3'),
            __('guide.records.simple.item2_4')
          ]
        },
        {
          heading: __('guide.records.simple.heading3'),
          isTips: true,
          items: [
            __('guide.records.simple.tip3_1'),
            __('guide.records.simple.tip3_2'),
            __('guide.records.simple.tip3_3'),
            __('guide.records.simple.tip3_4')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.records.detailed.heading1'),
          text: __('guide.records.detailed.text1')
        },
        {
          heading: __('guide.records.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.records.detailed.grid2_0_label'), __('guide.records.detailed.grid2_0_desc')],
            [__('guide.records.detailed.grid2_1_label'), __('guide.records.detailed.grid2_1_desc')],
            [__('guide.records.detailed.grid2_2_label'), __('guide.records.detailed.grid2_2_desc')],
            [__('guide.records.detailed.grid2_3_label'), __('guide.records.detailed.grid2_3_desc')],
            [__('guide.records.detailed.grid2_4_label'), __('guide.records.detailed.grid2_4_desc')],
            [__('guide.records.detailed.grid2_5_label'), __('guide.records.detailed.grid2_5_desc')],
            [__('guide.records.detailed.grid2_6_label'), __('guide.records.detailed.grid2_6_desc')],
            [__('guide.records.detailed.grid2_7_label'), __('guide.records.detailed.grid2_7_desc')],
            [__('guide.records.detailed.grid2_8_label'), __('guide.records.detailed.grid2_8_desc')],
            [__('guide.records.detailed.grid2_9_label'), __('guide.records.detailed.grid2_9_desc')],
          ]
        },
        {
          heading: __('guide.records.detailed.heading3'),
          isOrdered: true,
          items: [
            __('guide.records.detailed.item3_1'),
            __('guide.records.detailed.item3_2'),
            __('guide.records.detailed.item3_3'),
            __('guide.records.detailed.item3_4'),
            __('guide.records.detailed.item3_5'),
          ]
        },
        {
          heading: __('guide.records.detailed.heading4'),
          isTable: true,
          rows: [
            [__('guide.records.detailed.row4_0_label'), __('guide.records.detailed.row4_0_desc')],
            [__('guide.records.detailed.row4_1_label'), __('guide.records.detailed.row4_1_desc')],
            [__('guide.records.detailed.row4_2_label'), __('guide.records.detailed.row4_2_desc')],
            [__('guide.records.detailed.row4_3_label'), __('guide.records.detailed.row4_3_desc')],
            [__('guide.records.detailed.row4_4_label'), __('guide.records.detailed.row4_4_desc')],
            [__('guide.records.detailed.row4_5_label'), __('guide.records.detailed.row4_5_desc')],
          ]
        },
        {
          heading: __('guide.records.detailed.heading5'),
          isTable: true,
          rows: [
            [__('guide.records.detailed.row5_0_label'), __('guide.records.detailed.row5_0_desc')],
            [__('guide.records.detailed.row5_1_label'), __('guide.records.detailed.row5_1_desc')],
            [__('guide.records.detailed.row5_2_label'), __('guide.records.detailed.row5_2_desc')],
          ]
        },
        {
          heading: __('guide.records.detailed.heading6'),
          isTips: true,
          items: [
            __('guide.records.detailed.tip6_1'),
            __('guide.records.detailed.tip6_2'),
            __('guide.records.detailed.tip6_3'),
            __('guide.records.detailed.tip6_4'),
            __('guide.records.detailed.tip6_5'),
            __('guide.records.detailed.tip6_6'),
            __('guide.records.detailed.tip6_7'),
          ]
        }
      ]
    }
  },

  categories: {
    title: __('guide.categories.title'),
    simple: {
      content: [
        {
          heading: __('guide.categories.simple.heading1'),
          text: __('guide.categories.simple.text1')
        },
        {
          heading: __('guide.categories.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.categories.simple.item2_1'),
            __('guide.categories.simple.item2_2'),
            __('guide.categories.simple.item2_3'),
            __('guide.categories.simple.item2_4')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.categories.detailed.heading1'),
          text: __('guide.categories.detailed.text1')
        },
        {
          heading: __('guide.categories.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.categories.detailed.grid2_0_label'), __('guide.categories.detailed.grid2_0_desc')],
            [__('guide.categories.detailed.grid2_1_label'), __('guide.categories.detailed.grid2_1_desc')],
            [__('guide.categories.detailed.grid2_2_label'), __('guide.categories.detailed.grid2_2_desc')],
            [__('guide.categories.detailed.grid2_3_label'), __('guide.categories.detailed.grid2_3_desc')],
            [__('guide.categories.detailed.grid2_4_label'), __('guide.categories.detailed.grid2_4_desc')],
            [__('guide.categories.detailed.grid2_5_label'), __('guide.categories.detailed.grid2_5_desc')],
            [__('guide.categories.detailed.grid2_6_label'), __('guide.categories.detailed.grid2_6_desc')],
          ]
        },
        {
          heading: __('guide.categories.detailed.heading3'),
          isOrdered: true,
          items: [
            __('guide.categories.detailed.item3_1'),
            __('guide.categories.detailed.item3_2'),
            __('guide.categories.detailed.item3_3'),
            __('guide.categories.detailed.item3_4'),
            __('guide.categories.detailed.item3_5'),
            __('guide.categories.detailed.item3_6'),
          ]
        },
        {
          heading: __('guide.categories.detailed.heading4'),
          isTable: true,
          rows: [
            [__('guide.categories.detailed.row4_0_label'), __('guide.categories.detailed.row4_0_desc')],
            [__('guide.categories.detailed.row4_1_label'), __('guide.categories.detailed.row4_1_desc')],
            [__('guide.categories.detailed.row4_2_label'), __('guide.categories.detailed.row4_2_desc')],
            [__('guide.categories.detailed.row4_3_label'), __('guide.categories.detailed.row4_3_desc')],
            [__('guide.categories.detailed.row4_4_label'), __('guide.categories.detailed.row4_4_desc')],
          ]
        },
        {
          heading: __('guide.categories.detailed.heading5'),
          text: __('guide.categories.detailed.text5')
        },
        {
          heading: __('guide.categories.detailed.heading6'),
          isTips: true,
          items: [
            __('guide.categories.detailed.tip6_1'),
            __('guide.categories.detailed.tip6_2'),
            __('guide.categories.detailed.tip6_3'),
            __('guide.categories.detailed.tip6_4'),
          ]
        }
      ]
    }
  },

  stats: {
    title: __('guide.stats.title'),
    simple: {
      content: [
        {
          heading: __('guide.stats.simple.heading1'),
          text: __('guide.stats.simple.text1')
        },
        {
          heading: __('guide.stats.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.stats.simple.item2_1'),
            __('guide.stats.simple.item2_2'),
            __('guide.stats.simple.item2_3'),
            __('guide.stats.simple.item2_4')
          ]
        },
        {
          heading: __('guide.stats.simple.heading3'),
          isTips: true,
          items: [
            __('guide.stats.simple.tip3_1'),
            __('guide.stats.simple.tip3_2'),
            __('guide.stats.simple.tip3_3'),
            __('guide.stats.simple.tip3_4')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.stats.detailed.heading1'),
          text: __('guide.stats.detailed.text1')
        },
        {
          heading: __('guide.stats.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.stats.detailed.grid2_0_label'), __('guide.stats.detailed.grid2_0_desc')],
            [__('guide.stats.detailed.grid2_1_label'), __('guide.stats.detailed.grid2_1_desc')],
            [__('guide.stats.detailed.grid2_2_label'), __('guide.stats.detailed.grid2_2_desc')],
            [__('guide.stats.detailed.grid2_3_label'), __('guide.stats.detailed.grid2_3_desc')],
            [__('guide.stats.detailed.grid2_4_label'), __('guide.stats.detailed.grid2_4_desc')],
            [__('guide.stats.detailed.grid2_5_label'), __('guide.stats.detailed.grid2_5_desc')],
            [__('guide.stats.detailed.grid2_6_label'), __('guide.stats.detailed.grid2_6_desc')],
            [__('guide.stats.detailed.grid2_7_label'), __('guide.stats.detailed.grid2_7_desc')],
            [__('guide.stats.detailed.grid2_8_label'), __('guide.stats.detailed.grid2_8_desc')],
            [__('guide.stats.detailed.grid2_9_label'), __('guide.stats.detailed.grid2_9_desc')],
            [__('guide.stats.detailed.grid2_10_label'), __('guide.stats.detailed.grid2_10_desc')],
          ]
        },
        {
          heading: __('guide.stats.detailed.heading3'),
          text: __('guide.stats.detailed.text3')
        },
        {
          heading: __('guide.stats.detailed.heading4'),
          isOrdered: true,
          items: [
            __('guide.stats.detailed.item4_1'),
            __('guide.stats.detailed.item4_2'),
            __('guide.stats.detailed.item4_3'),
            __('guide.stats.detailed.item4_4'),
            __('guide.stats.detailed.item4_5'),
          ]
        },
        {
          heading: __('guide.stats.detailed.heading5'),
          isTable: true,
          rows: [
            [__('guide.stats.detailed.row5_0_label'), __('guide.stats.detailed.row5_0_desc')],
            [__('guide.stats.detailed.row5_1_label'), __('guide.stats.detailed.row5_1_desc')],
            [__('guide.stats.detailed.row5_2_label'), __('guide.stats.detailed.row5_2_desc')],
            [__('guide.stats.detailed.row5_3_label'), __('guide.stats.detailed.row5_3_desc')],
            [__('guide.stats.detailed.row5_4_label'), __('guide.stats.detailed.row5_4_desc')],
            [__('guide.stats.detailed.row5_5_label'), __('guide.stats.detailed.row5_5_desc')],
          ]
        },
        {
          heading: __('guide.stats.detailed.heading6'),
          isTips: true,
          items: [
            __('guide.stats.detailed.tip6_1'),
            __('guide.stats.detailed.tip6_2'),
            __('guide.stats.detailed.tip6_3'),
            __('guide.stats.detailed.tip6_4'),
            __('guide.stats.detailed.tip6_5'),
          ]
        }
      ]
    }
  },

  report: {
    title: __('guide.report.title'),
    simple: {
      content: [
        {
          heading: __('guide.report.simple.heading1'),
          text: __('guide.report.simple.text1')
        },
        {
          heading: __('guide.report.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.report.simple.item2_1'),
            __('guide.report.simple.item2_2'),
            __('guide.report.simple.item2_3'),
            __('guide.report.simple.item2_4')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.report.detailed.heading1'),
          text: __('guide.report.detailed.text1')
        },
        {
          heading: __('guide.report.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.report.detailed.grid2_0_label'), __('guide.report.detailed.grid2_0_desc')],
            [__('guide.report.detailed.grid2_1_label'), __('guide.report.detailed.grid2_1_desc')],
            [__('guide.report.detailed.grid2_2_label'), __('guide.report.detailed.grid2_2_desc')],
            [__('guide.report.detailed.grid2_3_label'), __('guide.report.detailed.grid2_3_desc')],
            [__('guide.report.detailed.grid2_4_label'), __('guide.report.detailed.grid2_4_desc')],
            [__('guide.report.detailed.grid2_5_label'), __('guide.report.detailed.grid2_5_desc')],
            [__('guide.report.detailed.grid2_6_label'), __('guide.report.detailed.grid2_6_desc')],
            [__('guide.report.detailed.grid2_7_label'), __('guide.report.detailed.grid2_7_desc')],
            [__('guide.report.detailed.grid2_8_label'), __('guide.report.detailed.grid2_8_desc')],
            [__('guide.report.detailed.grid2_9_label'), __('guide.report.detailed.grid2_9_desc')],
          ]
        },
        {
          heading: __('guide.report.detailed.heading3'),
          isOrdered: true,
          items: [
            __('guide.report.detailed.item3_1'),
            __('guide.report.detailed.item3_2'),
            __('guide.report.detailed.item3_3'),
            __('guide.report.detailed.item3_4'),
            __('guide.report.detailed.item3_5'),
          ]
        },
        {
          heading: __('guide.report.detailed.heading4'),
          isTable: true,
          rows: [
            [__('guide.report.detailed.row4_0_label'), __('guide.report.detailed.row4_0_desc')],
            [__('guide.report.detailed.row4_1_label'), __('guide.report.detailed.row4_1_desc')],
            [__('guide.report.detailed.row4_2_label'), __('guide.report.detailed.row4_2_desc')],
            [__('guide.report.detailed.row4_3_label'), __('guide.report.detailed.row4_3_desc')],
            [__('guide.report.detailed.row4_4_label'), __('guide.report.detailed.row4_4_desc')],
            [__('guide.report.detailed.row4_5_label'), __('guide.report.detailed.row4_5_desc')],
            [__('guide.report.detailed.row4_6_label'), __('guide.report.detailed.row4_6_desc')],
          ]
        },
        {
          heading: __('guide.report.detailed.heading5'),
          isTips: true,
          items: [
            __('guide.report.detailed.tip5_1'),
            __('guide.report.detailed.tip5_2'),
            __('guide.report.detailed.tip5_3'),
          ]
        }
      ]
    }
  },

  whatif: {
    title: __('guide.whatif.title'),
    simple: {
      content: [
        {
          heading: __('guide.whatif.simple.heading1'),
          text: __('guide.whatif.simple.text1')
        },
        {
          heading: __('guide.whatif.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.whatif.simple.item2_1'),
            __('guide.whatif.simple.item2_2'),
            __('guide.whatif.simple.item2_3'),
            __('guide.whatif.simple.item2_4'),
            __('guide.whatif.simple.item2_5')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.whatif.detailed.heading1'),
          text: __('guide.whatif.detailed.text1')
        },
        {
          heading: __('guide.whatif.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.whatif.detailed.grid2_0_label'), __('guide.whatif.detailed.grid2_0_desc')],
            [__('guide.whatif.detailed.grid2_1_label'), __('guide.whatif.detailed.grid2_1_desc')],
            [__('guide.whatif.detailed.grid2_2_label'), __('guide.whatif.detailed.grid2_2_desc')],
            [__('guide.whatif.detailed.grid2_3_label'), __('guide.whatif.detailed.grid2_3_desc')],
            [__('guide.whatif.detailed.grid2_4_label'), __('guide.whatif.detailed.grid2_4_desc')],
            [__('guide.whatif.detailed.grid2_5_label'), __('guide.whatif.detailed.grid2_5_desc')],
            [__('guide.whatif.detailed.grid2_6_label'), __('guide.whatif.detailed.grid2_6_desc')],
            [__('guide.whatif.detailed.grid2_7_label'), __('guide.whatif.detailed.grid2_7_desc')],
          ]
        },
        {
          heading: __('guide.whatif.detailed.heading3'),
          isTable: true,
          rows: [
            [__('guide.whatif.detailed.row3_0_label'), __('guide.whatif.detailed.row3_0_desc')],
            [__('guide.whatif.detailed.row3_1_label'), __('guide.whatif.detailed.row3_1_desc')],
            [__('guide.whatif.detailed.row3_2_label'), __('guide.whatif.detailed.row3_2_desc')],
            [__('guide.whatif.detailed.row3_3_label'), __('guide.whatif.detailed.row3_3_desc')],
            [__('guide.whatif.detailed.row3_4_label'), __('guide.whatif.detailed.row3_4_desc')],
            [__('guide.whatif.detailed.row3_5_label'), __('guide.whatif.detailed.row3_5_desc')],
          ]
        },
        {
          heading: __('guide.whatif.detailed.heading4'),
          isOrdered: true,
          items: [
            __('guide.whatif.detailed.item4_1'),
            __('guide.whatif.detailed.item4_2'),
            __('guide.whatif.detailed.item4_3'),
            __('guide.whatif.detailed.item4_4'),
            __('guide.whatif.detailed.item4_5'),
            __('guide.whatif.detailed.item4_6'),
          ]
        },
        {
          heading: __('guide.whatif.detailed.heading5'),
          isTips: true,
          items: [
            __('guide.whatif.detailed.tip5_1'),
            __('guide.whatif.detailed.tip5_2'),
            __('guide.whatif.detailed.tip5_3'),
            __('guide.whatif.detailed.tip5_4'),
            __('guide.whatif.detailed.tip5_5'),
          ]
        }
      ]
    }
  },

  settings: {
    title: __('guide.settings.title'),
    simple: {
      content: [
        {
          heading: __('guide.settings.simple.heading1'),
          text: __('guide.settings.simple.text1')
        },
        {
          heading: __('guide.settings.simple.heading2'),
          isOrdered: true,
          items: [
            __('guide.settings.simple.item2_1'),
            __('guide.settings.simple.item2_2'),
            __('guide.settings.simple.item2_3'),
            __('guide.settings.simple.item2_4'),
            __('guide.settings.simple.item2_5'),
            __('guide.settings.simple.item2_6')
          ]
        }
      ]
    },
    detailed: {
      content: [
        {
          heading: __('guide.settings.detailed.heading1'),
          text: __('guide.settings.detailed.text1')
        },
        {
          heading: __('guide.settings.detailed.heading2'),
          isGrid: true,
          items: [
            [__('guide.settings.detailed.grid2_0_label'), __('guide.settings.detailed.grid2_0_desc')],
            [__('guide.settings.detailed.grid2_1_label'), __('guide.settings.detailed.grid2_1_desc')],
            [__('guide.settings.detailed.grid2_2_label'), __('guide.settings.detailed.grid2_2_desc')],
            [__('guide.settings.detailed.grid2_3_label'), __('guide.settings.detailed.grid2_3_desc')],
            [__('guide.settings.detailed.grid2_4_label'), __('guide.settings.detailed.grid2_4_desc')],
            [__('guide.settings.detailed.grid2_5_label'), __('guide.settings.detailed.grid2_5_desc')],
            [__('guide.settings.detailed.grid2_6_label'), __('guide.settings.detailed.grid2_6_desc')],
            [__('guide.settings.detailed.grid2_7_label'), __('guide.settings.detailed.grid2_7_desc')],
            [__('guide.settings.detailed.grid2_8_label'), __('guide.settings.detailed.grid2_8_desc')],
            [__('guide.settings.detailed.grid2_9_label'), __('guide.settings.detailed.grid2_9_desc')],
            [__('guide.settings.detailed.grid2_10_label'), __('guide.settings.detailed.grid2_10_desc')],
          ]
        },
        {
          heading: __('guide.settings.detailed.heading3'),
          isTable: true,
          rows: [
            [__('guide.settings.detailed.row3_0_label'), __('guide.settings.detailed.row3_0_desc')],
            [__('guide.settings.detailed.row3_1_label'), __('guide.settings.detailed.row3_1_desc')],
            [__('guide.settings.detailed.row3_2_label'), __('guide.settings.detailed.row3_2_desc')],
            [__('guide.settings.detailed.row3_3_label'), __('guide.settings.detailed.row3_3_desc')],
          ]
        },
        {
          heading: __('guide.settings.detailed.heading4'),
          isTable: true,
          rows: [
            [__('guide.settings.detailed.row4_0_label'), __('guide.settings.detailed.row4_0_desc')],
            [__('guide.settings.detailed.row4_1_label'), __('guide.settings.detailed.row4_1_desc')],
            [__('guide.settings.detailed.row4_2_label'), __('guide.settings.detailed.row4_2_desc')],
            [__('guide.settings.detailed.row4_3_label'), __('guide.settings.detailed.row4_3_desc')],
            [__('guide.settings.detailed.row4_4_label'), __('guide.settings.detailed.row4_4_desc')],
            [__('guide.settings.detailed.row4_5_label'), __('guide.settings.detailed.row4_5_desc')],
          ]
        },
        {
          heading: __('guide.settings.detailed.heading5'),
          isTips: true,
          items: [
            __('guide.settings.detailed.tip5_1'),
            __('guide.settings.detailed.tip5_2'),
            __('guide.settings.detailed.tip5_3'),
            __('guide.settings.detailed.tip5_4'),
            __('guide.settings.detailed.tip5_5'),
            __('guide.settings.detailed.tip5_6'),
          ]
        }
      ]
    }
  }
};

let _guidePageKey = null;
let _guideShowDetailed = false;

function showPageGuide(pageKey) {
  _guidePageKey = pageKey;
  _guideShowDetailed = false;
  renderGuideModal();
}

function renderGuideModal() {
  const guide = PAGE_GUIDES[_guidePageKey];
  if (!guide) return;

  const mode = _guideShowDetailed ? 'detailed' : 'simple';
  const sections = guide[mode].content;

  // Build HTML
  let html = `<div class="modal-title" style="font-size:1.1rem;margin-bottom:12px">`;
  html += `<span>${guide.title}</span>`;
  html += ` <button class="guide-mode-toggle" onclick="toggleGuideMode()" title="${_guideShowDetailed ? __('guide.toggle.simple') : __('guide.toggle.detailed')}">${_guideShowDetailed ? __('guide.mode.simple') : __('guide.mode.detailed')}</button>`;
  html += `</div>`;

  for (const section of sections) {
    html += '<div class="guide-section">';

    if (section.heading) {
      html += `<h3>${section.heading}</h3>`;
    }

    if (section.isGrid && section.items) {
      html += '<div class="guide-feature-grid">';
      for (const item of section.items) {
        html += `<div class="guide-feature-item"><strong>${item[0]}</strong>${item[1]}</div>`;
      }
      html += '</div>';
    } else if (section.isOrdered && section.items) {
      html += '<ol>';
      for (const item of section.items) {
        html += `<li>${item}</li>`;
      }
      html += '</ol>';
    } else if (section.isTable && section.rows) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
      html += '<tbody>';
      for (const row of section.rows) {
        html += `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--border);font-weight:600;color:var(--text-primary);white-space:nowrap;vertical-align:top">${row[0]}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${row[1]}</td></tr>`;
      }
      html += '</tbody></table>';
    } else if (section.isTips && section.items) {
      for (const tip of section.items) {
        html += `<div class="guide-tip">💡 ${tip}</div>`;
      }
    } else if (section.text) {
      html += `<p>${section.text}</p>`;
    }

    html += '</div>';
  }

  html += '<div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">' + __('guide.gotIt') + '</button></div>';

  // Adjust modal width for detailed content
  if (_guideShowDetailed) {
    document.getElementById('modalContent').style.maxWidth = '580px';
  } else {
    document.getElementById('modalContent').style.maxWidth = '';
  }

  showModal(html);
  document.getElementById('modalContent').scrollTop = 0;
}

function toggleGuideMode() {
  _guideShowDetailed = !_guideShowDetailed;
  renderGuideModal();
}

// Export
window.showPageGuide = showPageGuide;
window.toggleGuideMode = toggleGuideMode;
window.PAGE_GUIDES = PAGE_GUIDES;

// === I18N REGISTRATION ===
addI18nEntries({
  'guide.add.detailed.grid2_0_desc': { zh: '输入消费金额（马币 RM），支持小数点后两位', en: 'Enter the spending amount (Malaysian Ringgit RM), supports two decimal places' },
  'guide.add.detailed.grid2_0_label': { zh: '金额输入', en: 'Amount Input' },
  'guide.add.detailed.grid2_1_desc': { zh: '从分类树中选择对应的消费类别，支持搜索和账单分类', en: 'Pick a spending category from the category tree, supports search and bill categories' },
  'guide.add.detailed.grid2_1_label': { zh: '分类选择', en: 'Category Selection' },
  'guide.add.detailed.grid2_2_desc': { zh: '给记录打场景标签（如"社交"、"工作"），可多选，支持搜索和创建新标签', en: 'Add context tags to the record (e.g. “Social,” “Work”), multi-select, supports search and creating new tags' },
  'guide.add.detailed.grid2_2_label': { zh: '标签选择', en: 'Tag Selection' },
  'guide.add.detailed.grid2_3_desc': { zh: '记录消费发生的时间，默认为现在，可手动改为过去的日期', en: 'Record when the expense happened, defaults to now, can be manually set to a past date' },
  'guide.add.detailed.grid2_3_label': { zh: '日期时间', en: 'Date & Time' },
  'guide.add.detailed.grid2_4_desc': { zh: '写一笔描述（如吃了什么、买了什么），最长 200 字', en: 'Write a brief description (e.g. what you ate or bought), max 200 characters' },
  'guide.add.detailed.grid2_4_label': { zh: '备注', en: 'Notes' },
  'guide.add.detailed.grid2_5_desc': { zh: '标注这笔是大额/一次性消费，不计入日均支出统计', en: 'Mark this as a large one-time expense so it doesn’t skew your daily average' },
  'guide.add.detailed.grid2_5_label': { zh: '不计日均', en: 'Exclude from Daily Avg' },
  'guide.add.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.add.detailed.heading2': { zh: '🧩 包含哪些功能？', en: '🧩 Features at a Glance' },
  'guide.add.detailed.heading3': { zh: '🎯 如何使用', en: '🎯 How to Use' },
  'guide.add.detailed.heading4': { zh: '📋 参数说明', en: '📋 Parameter Reference' },
  'guide.add.detailed.heading5': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.add.detailed.item3_1': { zh: '在「金额」框里输入花了多少钱（只需输入数字，如 25.50）', en: 'Enter how much you spent in the “Amount” field (numbers only, e.g. 25.50)' },
  'guide.add.detailed.item3_2': { zh: '点击「分类」选择对应的消费类别。如果还没有想要的分类，先去「分类」页面添加', en: 'Tap “Category” to select the appropriate category. If the category doesn’t exist yet, go add it on the “Categories” page first' },
  'guide.add.detailed.item3_3': { zh: '可选：点击「＋ 添加标签」给这笔记录打场景标签，如"出差"、"聚餐"等，可多选', en: 'Optional: Tap “+ Add Tag” to add context tags like “Business Trip” or “Dinner,” multi-select supported' },
  'guide.add.detailed.item3_4': { zh: '「日期时间」通常不用改，默认为当前时间。如果补记以前的账可以改', en: 'The “Date & Time” usually doesn’t need changing — it defaults to the current time. Change it if you’re backdating an expense' },
  'guide.add.detailed.item3_5': { zh: '「备注」可填可不填，建议写清楚买了什么方便以后查看', en: 'The “Notes” field is optional, but it’s a good idea to describe what you bought for future reference' },
  'guide.add.detailed.item3_6': { zh: '如果是大额/一次性消费（如买手机、交房租），建议勾选「不计日均」', en: 'For large one-time purchases (e.g. phone, rent), check “Exclude from Daily Avg”' },
  'guide.add.detailed.item3_7': { zh: '点击「✅ 保存记录」，右上角出现绿色提示即保存成功', en: 'Tap “✅ Save Record” — a green indicator in the top-right corner confirms success' },
  'guide.add.detailed.row4_0_desc': { zh: '消费金额，单位马币 RM。必须大于 0，只接受数字和小数点', en: 'Spending amount in Malaysian Ringgit (RM). Must be greater than 0, accepts only numbers and decimal point' },
  'guide.add.detailed.row4_0_label': { zh: '金额', en: 'Amount' },
  'guide.add.detailed.row4_1_desc': { zh: '消费所属类别，可从预设分类中选择。必须先选分类才能保存', en: 'The category this expense belongs to, selected from preset categories. A category must be selected before saving' },
  'guide.add.detailed.row4_1_label': { zh: '分类', en: 'Category' },
  'guide.add.detailed.row4_2_desc': { zh: '场景标签（如"社交"、"工作"），可多选，可在标签选择器中搜索或创建新标签', en: 'Context tags (e.g. “Social,” “Work”), multi-select, can search or create new tags in the tag picker' },
  'guide.add.detailed.row4_2_label': { zh: '标签', en: 'Tag' },
  'guide.add.detailed.row4_3_desc': { zh: '消费发生的日期和时间。默认为当前时间，可自由修改', en: 'When the expense occurred. Defaults to the current time, freely adjustable' },
  'guide.add.detailed.row4_3_label': { zh: '日期时间', en: 'Date & Time' },
  'guide.add.detailed.row4_4_desc': { zh: '消费说明，最长 200 字。保存时会自动去掉首尾空格', en: 'Expense description, max 200 characters. Leading/trailing spaces are trimmed on save' },
  'guide.add.detailed.row4_4_label': { zh: '备注', en: 'Notes' },
  'guide.add.detailed.row4_5_desc': { zh: '勾选后此记录不会影响日均支出和预测总支出的计算。适合一次性大额消费', en: 'When checked, this record won’t affect daily average or projected total calculations. Suitable for one-time large purchases' },
  'guide.add.detailed.row4_5_label': { zh: '不计日均', en: 'Exclude from Daily Avg' },
  'guide.add.detailed.text1': { zh: '这里是「记账」页面，你每次花钱后来这里记录一笔支出。填上金额、选个分类、写个备注，保存就完成了。所有后续的统计、分析、报表都依赖你在这里记录的数据。', en: 'This is the “Add Record” page. Every time you spend money, you come here to log it. Enter the amount, pick a category, write a note, and save. All subsequent statistics, analysis, and reports depend on the data you enter here.' },
  'guide.add.detailed.tip5_1': { zh: '保存后表单会自动清空，方便连续记账', en: 'The form clears automatically after saving for consecutive entries' },
  'guide.add.detailed.tip5_2': { zh: '分类选择弹窗中，账单分类（如房租、水电）会单独显示在"📋 月账单"区域', en: 'In the category picker, bill categories (e.g. rent, utilities) are shown separately under “📋 Monthly Bills”' },
  'guide.add.detailed.tip5_3': { zh: '如果保存后发现金额或分类选错了，别担心——去「流水」页面点击那条记录就能修改或删除', en: 'If you notice a mistake after saving — don’t worry. Go to the “Records” page and tap that entry to edit or delete it' },
  'guide.add.detailed.tip5_4': { zh: '标签与分类不重叠：分类回答"钱花在哪"，标签回答"这笔支出的场景是什么"', en: 'Tags and categories don’t overlap: categories answer “where did the money go,” tags answer “what was the context of this expense”' },
  'guide.add.detailed.tip5_5': { zh: '如果保存后想修改标签，去「流水」页面点击记录，在编辑弹窗中修改', en: 'To change tags after saving, go to “Records,” tap the entry, and edit in the popup' },
  'guide.add.detailed.tip5_6': { zh: '建议每花一笔马上记，养成习惯后每天只需 10 秒钟', en: 'Log each expense right away — once it becomes a habit, it only takes about 10 seconds a day' },
  'guide.add.simple.heading1': { zh: '📖 记录每一笔消费', en: '📖 Record Every Expense' },
  'guide.add.simple.heading2': { zh: '🎯 如何记账', en: '🎯 How to Add a Record' },
  'guide.add.simple.heading3': { zh: '💡 快速提示', en: '💡 Quick Tips' },
  'guide.add.simple.item2_1': { zh: '输入金额（只需数字，如 25.50）', en: 'Enter the amount (numbers only, e.g. 25.50)' },
  'guide.add.simple.item2_2': { zh: '点击「分类」选择消费类别', en: 'Tap “Category” to select a spending category' },
  'guide.add.simple.item2_3': { zh: '可选：点击「添加标签」给这笔记录打场景标签（如"社交"、"工作"）', en: 'Optional: Tap “Add Tag” to tag this record with a context (e.g. “Social,” “Work”)' },
  'guide.add.simple.item2_4': { zh: '大额一次性消费（如买手机）建议勾选「📌 不计日均」', en: 'For large one-time purchases (e.g. buying a phone), check “📌 Exclude from Daily Avg”' },
  'guide.add.simple.item2_5': { zh: '点击「✅ 保存记录」', en: 'Tap “✅ Save Record”' },
  'guide.add.simple.text1': { zh: '花完钱来这里记一笔，所有后续统计都基于你记的数据。填金额 → 选分类 → 保存，三步搞定。', en: 'Come here after spending money to log it. All subsequent statistics are based on the data you enter. Fill in the amount → pick a category → save. Three steps and you’re done.' },
  'guide.add.simple.tip3_1': { zh: '保存后表单自动清空，方便连续记账', en: 'The form clears automatically after saving for consecutive entries' },
  'guide.add.simple.tip3_2': { zh: '填错了去「流水」页点击那条记录就能修改或删除', en: 'Made a mistake? Go to “Records” and tap that entry to edit or delete it' },
  'guide.add.title': { zh: '✏️ 记账', en: '✏️ Add Record' },
  'guide.categories.detailed.grid2_0_desc': { zh: '以树形结构展示所有分类，支持展开/折叠子分类', en: 'All categories shown in a tree structure, supports expand/collapse for subcategories' },
  'guide.categories.detailed.grid2_0_label': { zh: '分类树', en: 'Category Tree' },
  'guide.categories.detailed.grid2_1_desc': { zh: '可以添加根分类或子分类，自动分配颜色和排序', en: 'Add root or subcategories, automatically assigned a color and sort order' },
  'guide.categories.detailed.grid2_1_label': { zh: '添加分类', en: 'Add Category' },
  'guide.categories.detailed.grid2_2_desc': { zh: '修改名称、图标（88 个内置 Emoji）、颜色（14 色 + 自定义 HEX）', en: 'Modify name, icon (88 built-in emojis), and color (14 presets + custom HEX)' },
  'guide.categories.detailed.grid2_2_label': { zh: '编辑分类', en: 'Edit Category' },
  'guide.categories.detailed.grid2_3_desc': { zh: '为每个分类设置月度预算（固定金额或收入的百分比）', en: 'Set a monthly budget for each category (fixed amount or percentage of income)' },
  'guide.categories.detailed.grid2_3_label': { zh: '预算设置', en: 'Budget Settings' },
  'guide.categories.detailed.grid2_4_desc': { zh: '把分类移到其他父分类下或移到根级别', en: 'Move a category under a different parent or to the root level' },
  'guide.categories.detailed.grid2_4_label': { zh: '移动分类', en: 'Move Category' },
  'guide.categories.detailed.grid2_5_desc': { zh: '把两个分类合并，所有记录自动归并到目标分类', en: 'Merge two categories together; all records are automatically reassigned' },
  'guide.categories.detailed.grid2_5_label': { zh: '合并分类', en: 'Merge Categories' },
  'guide.categories.detailed.grid2_6_desc': { zh: '删除分类时可选择删除子分类或将子分类上移', en: 'When deleting, choose whether to also delete subcategories or promote them up one level' },
  'guide.categories.detailed.grid2_6_label': { zh: '删除分类', en: 'Delete Category' },
  'guide.categories.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.categories.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.categories.detailed.heading3': { zh: '🎯 如何使用', en: '🎯 How to Use' },
  'guide.categories.detailed.heading4': { zh: '📋 参数说明', en: '📋 Parameter Reference' },
  'guide.categories.detailed.heading5': { zh: '⚠️ 前提条件', en: '⚠️ Prerequisites' },
  'guide.categories.detailed.heading6': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.categories.detailed.item3_1': { zh: '【添加分类】点击页面顶部的"➕ 添加根分类"，输入名称和图标即可', en: '【Add a category】Click “+ Add Root Category” at the top of the page, enter a name and pick an icon' },
  'guide.categories.detailed.item3_2': { zh: '【添加子分类】鼠标悬停在分类上，点击出现的 ➕ 按钮', en: '【Add a subcategory】Hover over a category and click the + button that appears' },
  'guide.categories.detailed.item3_3': { zh: '【设置预算】每个分类右侧有预算输入框，输入金额后按回车或点击空白处保存', en: '【Set a budget】Each category has a budget input on the right; type an amount and press Enter or click away to save' },
  'guide.categories.detailed.item3_4': { zh: '【编辑分类】点击分类右侧的 ⚙️ 按钮，可修改名称、图标、颜色', en: '【Edit a category】Click the ⚙️ button to its right to change name, icon, or color' },
  'guide.categories.detailed.item3_5': { zh: '【移动/合并】在编辑弹窗中点击"📦 移动到…"或"🔀 合并到…"', en: '【Move / merge】In the edit popup, click “📦 Move to…” or “🔀 Merge into…”' },
  'guide.categories.detailed.item3_6': { zh: '【删除分类】在编辑弹窗中点击"🗑️ 删除"，有子分类时可选保留或删除子分类', en: '【Delete a category】In the edit popup, click “🗑️ Delete.” If there are subcategories, choose to keep or delete them' },
  'guide.categories.detailed.row4_0_desc': { zh: '每个分类有一个 Emoji 图标，88 种预设可选，帮助快速识别', en: 'Each category has an emoji icon, 88 presets to choose from, for quick visual identification' },
  'guide.categories.detailed.row4_0_label': { zh: '图标', en: 'Icon' },
  'guide.categories.detailed.row4_1_desc': { zh: '每个分类有一种颜色，14 种预设色 + 可自定义 HEX 色码', en: 'Each category has a color, 14 presets + custom HEX color codes' },
  'guide.categories.detailed.row4_1_label': { zh: '颜色', en: 'Color' },
  'guide.categories.detailed.row4_2_desc': { zh: '每月该分类最多花多少，固定金额模式', en: 'Maximum monthly spend for this category, fixed-amount mode' },
  'guide.categories.detailed.row4_2_label': { zh: '预算（RM）', en: 'Budget (RM)' },
  'guide.categories.detailed.row4_3_desc': { zh: '每月该分类最多花月收入的百分之几，百分比模式', en: 'Maximum monthly spend as a percentage of income, percentage mode' },
  'guide.categories.detailed.row4_3_label': { zh: '预算（%）', en: 'Budget (%)' },
  'guide.categories.detailed.row4_4_desc': { zh: '子分类的预算总和不能超过父分类的预算', en: 'The sum of subcategory budgets cannot exceed the parent category’s budget' },
  'guide.categories.detailed.row4_4_label': { zh: '子分类预算', en: 'Subcategory Budget' },
  'guide.categories.detailed.text1': { zh: '「分类」是管理你所有消费类别的页面。你可以添加不同的消费分类（如餐饮、交通、购物），给每个分类设置图标、颜色、子分类，以及最重要的——<strong>每月预算</strong>。分类是记账的骨架，好的分类体系让统计和预算管理更清晰。', en: '“Categories” is where you manage all your spending categories. You can add different categories (e.g. dining, transport, shopping), assign icons, colors, and subcategories, and most importantly — set a <strong>monthly budget</strong> for each one. Categories are the backbone of your budgeting. A good category structure makes statistics and budget management much clearer.' },
  'guide.categories.detailed.text5': { zh: '建议先建立 3-5 个根分类（如餐饮、交通、购物、住房、娱乐），再在下面添加子分类。预算以月为单位，每月需要重新设置（当前月份的预算）。', en: 'We recommend starting with 3–5 root categories (e.g. dining, transport, shopping, housing, entertainment), then adding subcategories below them. Budgets are set per month and need to be reconfigured each month.' },
  'guide.categories.detailed.tip6_1': { zh: '预算切换 RM/% 模式时，点击右侧的 RM 或 % 按钮即可切换', en: 'To switch between RM and % budget modes, click the RM or % button on the right' },
  'guide.categories.detailed.tip6_2': { zh: '合并分类是不可撤销的操作，合并前请确认', en: 'Merging categories is irreversible — please confirm before merging' },
  'guide.categories.detailed.tip6_3': { zh: '删除分类不会删除相关记录，只是记录变成"无分类"状态', en: 'Deleting a category does not delete related records; they just become “uncategorized”' },
  'guide.categories.detailed.tip6_4': { zh: '展开/折叠状态不会保存，刷新页面后全部收起', en: 'Expand/collapse states are not saved and reset on page refresh' },
  'guide.categories.simple.heading1': { zh: '📖 管理消费分类和预算', en: '📖 Manage Spending Categories & Budgets' },
  'guide.categories.simple.heading2': { zh: '🎯 核心操作', en: '🎯 Core Operations' },
  'guide.categories.simple.item2_1': { zh: '【添加分类】点击顶部「➕ 添加根分类」，或把鼠标移到分类上点 ➕ 添加子分类', en: '【Add Category】Click “+ Add Root Category” at the top, or hover over a category and click + to add a subcategory' },
  'guide.categories.simple.item2_2': { zh: '【设置预算】每个分类右侧有预算输入框，输入金额后按回车保存', en: '【Set Budget】Each category has a budget input on the right; type an amount and press Enter to save' },
  'guide.categories.simple.item2_3': { zh: '【编辑分类】点击分类右侧 ⚙️ 按钮，修改名称、图标、颜色', en: '【Edit Category】Click the ⚙️ button on a category to change its name, icon, and color' },
  'guide.categories.simple.item2_4': { zh: '【合并分类】编辑弹窗中选「🔀 合并到…」，把两个分类合并', en: '【Merge Categories】Select “🔀 Merge into…” in the edit popup to combine two categories' },
  'guide.categories.simple.text1': { zh: '添加、编辑、移动、合并分类，为每个分类设置月度预算。好的分类体系让记账和统计更清晰。', en: 'Add, edit, move, and merge categories. Set a monthly budget for each one. A well-organized category system makes tracking and statistics much clearer.' },
  'guide.categories.title': { zh: '🏷️ 分类', en: '🏷️ Categories' },
  'guide.gotIt': { zh: '我知道了', en: 'Got it' },
  'guide.mode.detailed': { zh: '📖 详尽', en: '📖 Detailed' },
  'guide.mode.simple': { zh: '📖 简洁', en: '📖 Simple' },
  'guide.overview.detailed.grid2_0_desc': { zh: '当月所有消费的合计金额，包含日常和账单两部分', en: 'Sum of all consumption for the month, including both daily spending and bills' },
  'guide.overview.detailed.grid2_0_label': { zh: '本月总支出', en: 'Monthly Total Expenses' },
  'guide.overview.detailed.grid2_1_desc': { zh: '你在月账单中心设置的每月收入/预算，账单扣完后是净收入', en: 'Your monthly income/budget set in Bill Center; net income is what remains after bills' },
  'guide.overview.detailed.grid2_1_label': { zh: '月收入', en: 'Monthly Income' },
  'guide.overview.detailed.grid2_10_desc': { zh: '"记一笔"、"查看统计"、"月账单"三个常用入口按钮', en: 'Three shortcut buttons: “Add Record,” “View Stats,” and “Bill Center”' },
  'guide.overview.detailed.grid2_10_label': { zh: '快捷操作', en: 'Quick Actions' },
  'guide.overview.detailed.grid2_11_desc': { zh: '方格矩阵展示各标签花费占比，5档密度可调，悬停高亮，点击跳转流水页筛标签', en: 'A grid matrix showing tag spending proportions, with 5 density levels, hover highlights, and click-through to filter records' },
  'guide.overview.detailed.grid2_11_label': { zh: '标签分布 Waffle 图', en: 'Tag Distribution Waffle Chart' },
  'guide.overview.detailed.grid2_12_desc': { zh: '全局统计基于「本月」或「近30天」，在设置页切换，所有数据自动适配', en: 'Globally switch statistics between “This Month” and “Last 30 Days” in Settings; all data adapts automatically' },
  'guide.overview.detailed.grid2_12_label': { zh: '统计范围切换', en: 'Statistics Range Switcher' },
  'guide.overview.detailed.grid2_2_desc': { zh: '平均每天花多少钱（不计入一次性大额标注的记录）', en: 'Average daily spending (excluding one-time large-amount flagged records)' },
  'guide.overview.detailed.grid2_2_label': { zh: '日均支出', en: 'Daily Average' },
  'guide.overview.detailed.grid2_3_desc': { zh: '按照当前消费速度，月底预计总共花多少', en: 'Estimated total spending by month-end based on current pace' },
  'guide.overview.detailed.grid2_3_label': { zh: '预测月总支出', en: 'Projected Monthly Total' },
  'guide.overview.detailed.grid2_4_desc': { zh: '收入花掉多少的可视化环形图，超支变红色', en: 'Visual ring chart showing how much of your income has been spent; turns red when overspent' },
  'guide.overview.detailed.grid2_4_label': { zh: '预算进度环', en: 'Budget Progress Ring' },
  'guide.overview.detailed.grid2_5_desc': { zh: '与储蓄目标对比的进度环，达标变绿色', en: 'Progress ring comparing your savings against your goal; turns green when on track' },
  'guide.overview.detailed.grid2_5_label': { zh: '储蓄目标环', en: 'Savings Goal Ring' },
  'guide.overview.detailed.grid2_6_desc': { zh: '过去一周每天花费的折线图，方便看消费波动', en: 'Line chart of daily spending over the past week to spot fluctuations' },
  'guide.overview.detailed.grid2_6_label': { zh: '近7天趋势图', en: '7-Day Trend Chart' },
  'guide.overview.detailed.grid2_7_desc': { zh: '本月花钱最多的 5 个分类，带占比和超支提示', en: 'Your 5 most expensive categories this month, with percentages and overspend alerts' },
  'guide.overview.detailed.grid2_7_label': { zh: '支出排行 TOP 5', en: 'Top 5 Spending Categories' },
  'guide.overview.detailed.grid2_8_desc': { zh: '每个分类的预算使用进度，可切换单色/分段视图', en: 'Budget usage progress for each category, switchable between solid and segmented views' },
  'guide.overview.detailed.grid2_8_label': { zh: '分类预算进度条', en: 'Category Budget Progress Bars' },
  'guide.overview.detailed.grid2_9_desc': { zh: '哪些分类已经快把整月预算用完了（超过 80%）', en: 'Categories that have almost exhausted their monthly budget (over 80%)' },
  'guide.overview.detailed.grid2_9_label': { zh: '超支警告', en: 'Overspend Warnings' },
  'guide.overview.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.overview.detailed.heading2': { zh: '🧩 包含哪些功能？', en: '🧩 Features at a Glance' },
  'guide.overview.detailed.heading3': { zh: '⚠️ 前提条件', en: '⚠️ Prerequisites' },
  'guide.overview.detailed.heading4': { zh: '🎯 新手三步上手', en: '🎯 Getting Started in Three Steps' },
  'guide.overview.detailed.heading5': { zh: '📋 关键参数说明', en: '📋 Key Parameter Reference' },
  'guide.overview.detailed.heading6': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.overview.detailed.item4_1': { zh: '点击页面上的「📋 月账单中心」卡片（或者在设置页也可以打开），设置你的月收入金额', en: 'Tap the “📋 Bill Center” card on the page (or open it from Settings) to set your monthly income' },
  'guide.overview.detailed.item4_2': { zh: '去「设置」页面配置储蓄目标（固定金额或百分比）', en: 'Go to “Settings” to configure your savings goal (fixed amount or percentage)' },
  'guide.overview.detailed.item4_3': { zh: '去「分类」页面给常用分类设置预算，总览的预算进度条就会自动显示', en: 'Go to “Categories” to set budgets for your common categories, and the overview will show progress bars automatically' },
  'guide.overview.detailed.row5_0_desc': { zh: '当月所有消费的和。如果勾选了"含账单"，会把账单支出也算进去', en: 'Sum of all monthly spending. If “Include Bills” is checked, bills are included' },
  'guide.overview.detailed.row5_0_label': { zh: '本月总支出', en: 'Monthly Total Expenses' },
  'guide.overview.detailed.row5_1_desc': { zh: '总支出 ÷ 已过天数。标注了"不计日均"的大额消费不会拉高这个数', en: 'Total expenses ÷ days elapsed. Large expenses flagged as “exclude from daily avg” won’t affect this number' },
  'guide.overview.detailed.row5_1_label': { zh: '日均支出', en: 'Daily Average' },
  'guide.overview.detailed.row5_2_desc': { zh: '日均支出 × 当月总天数。这个数字会告诉你月底大概会花多少', en: 'Daily average × total days in the month. This tells you roughly where you’ll end up' },
  'guide.overview.detailed.row5_2_label': { zh: '预测月总支出', en: 'Projected Monthly Total' },
  'guide.overview.detailed.row5_3_desc': { zh: '月收入 − 账单总额，即扣除固定账单后真正能花的钱', en: 'Monthly income − total bills — what’s actually available to spend after fixed costs' },
  'guide.overview.detailed.row5_3_label': { zh: '可支配收入', en: 'Disposable Income' },
  'guide.overview.detailed.row5_4_desc': { zh: '月收入 − 账单总额，如果账单超过收入这个值会是 0', en: 'Monthly income − total bills. If bills exceed income, this is 0' },
  'guide.overview.detailed.row5_4_label': { zh: '净收入', en: 'Net Income' },
  'guide.overview.detailed.row5_5_desc': { zh: '月收入 − 预测总支出 − 未付账单。正数表示预计能存下钱', en: 'Monthly income − projected total expenses − unpaid bills. A positive number means you’re on track to save' },
  'guide.overview.detailed.row5_5_label': { zh: '储蓄预测', en: 'Savings Forecast' },
  'guide.overview.detailed.text1': { zh: '总览是你的记账软件「首页」和「仪表盘」。打开软件第一眼看到的就是它。它的作用是让你在 <strong>10 秒内</strong>了解本月财务状况：花了多少、还剩多少、预算够不够、有没有超支危险。你不需要做任何操作，所有数字和图表自动从你的记账数据生成。\n\n<strong>💡 先了解两个概念：</strong><br>\n• <strong>账单</strong>：房租、水电、网费等每月固定支出。在总览页点击「📋 月账单中心」卡片可以设置月收入和账单金额。<br>\n• <strong>日常消费</strong>：餐饮、交通、购物等非固定支出。页面中的"含账单"复选框控制是否把账单算进统计数据里。', en: 'The overview is your budgeting app’s “homepage” and “dashboard.” It’s the first thing you see when you open the app. Its purpose is to let you understand your monthly finances <strong>within 10 seconds</strong>: how much you’ve spent, how much is left, whether your budget is on track, and whether there’s any risk of overspending. You don’t need to do anything — all numbers and charts are automatically generated from your data.\n\n<strong>💡 Two Key Concepts:</strong><br>\n• <strong>Bills</strong>: Fixed monthly expenses like rent, utilities, and internet. Tap the “📋 Bill Center” card on the overview page to set your monthly income and bill amounts.<br>\n• <strong>Daily Spending</strong>: Variable expenses such as dining, transport, and shopping. The “Include Bills” checkbox on the page controls whether bills are factored into the statistics.' },
  'guide.overview.detailed.text3': { zh: '• 月收入/预算：需在「月账单中心」设置<br>• 储蓄目标：需在「设置」页配置<br>• 分类预算：需在「分类」页面给每个分类设置金额<br>• 记账记录：至少有一笔消费记录，总览才会显示完整数据', en: '• Monthly income/budget: set it in “Bill Center”<br>• Savings goal: configure it on the “Settings” page<br>• Category budgets: set amounts for each category on the “Categories” page<br>• At least one expense record — the overview needs data to display' },
  'guide.overview.detailed.tip6_1': { zh: '点击「📋 含账单」复选框可以切换是否把账单支出纳入统计（预算环会重新计算）', en: 'Click the “📋 Include Bills” checkbox to toggle whether bill expenses are included in statistics (the budget ring recalculates)' },
  'guide.overview.detailed.tip6_2': { zh: '超支警告显示的是超过整月预算 80% 的分类，不是超过自己分类预算的分类', en: 'Overspend warnings show categories that exceed 80% of their full-month budget, not categories exceeding their own budgets' },
  'guide.overview.detailed.tip6_3': { zh: '预算进度条右下角的「👁️ 选择」可以只显示你关心的几个分类', en: 'The “👁️ Select” button at the bottom-right of the budget progress bar lets you show only the categories you care about' },
  'guide.overview.detailed.tip6_4': { zh: '总览的数据范围跟随「设置」页的统计范围切换（本月/近30天）', en: 'The overview data range follows the statistics range setting in Settings (This Month / Last 30 Days)' },
  'guide.overview.simple.heading1': { zh: '📖 这是你的一站式财务仪表盘', en: '📖 Your All-in-One Financial Dashboard' },
  'guide.overview.simple.heading2': { zh: '🎯 三步让总览完整显示', en: '🎯 Three Steps to a Complete Overview' },
  'guide.overview.simple.heading3': { zh: '💡 快速提示', en: '💡 Quick Tips' },
  'guide.overview.simple.item2_1': { zh: '在页面顶部的卡片区域点击「📋 月账单中心」，设置你的月收入金额', en: 'Tap “📋 Bill Center” in the card area at the top of the page to set your monthly income' },
  'guide.overview.simple.item2_2': { zh: '去「设置」页配置储蓄目标', en: 'Go to “Settings” to configure your savings goal' },
  'guide.overview.simple.item2_3': { zh: '去「分类」页给常用分类设置预算', en: 'Go to “Categories” to set budgets for your frequently used categories' },
  'guide.overview.simple.text1': { zh: '打开软件第一眼看到的就是总览。所有数字自动生成，<strong>10 秒内</strong>看清本月：花了多少、还剩多少、预算够不够。', en: 'The overview is the first thing you see when you open the app. All numbers are automatically generated — <strong>within 10 seconds</strong> you\'ll know: how much you\'ve spent, how much is left, and whether your budget is on track.' },
  'guide.overview.simple.tip3_1': { zh: '「含账单」开关控制是否把房租水电等固定支出算进统计', en: 'The “Include Bills” toggle controls whether fixed expenses (rent, utilities) are included in statistics' },
  'guide.overview.simple.tip3_2': { zh: '超支警告显示的是超过整月预算 80% 的分类', en: 'Overspend warnings show categories that have exceeded 80% of their monthly budget' },
  'guide.overview.simple.tip3_3': { zh: '统计范围可在「设置」页切换「本月」/「近30天」，月初数据少时推荐用近30天', en: 'You can switch between “This Month” and “Last 30 Days” in Settings — early in the month, “Last 30 Days” gives more stable data' },
  'guide.overview.title': { zh: '📊 总览', en: '📊 Overview' },
  'guide.records.detailed.grid2_0_desc': { zh: '按关键词、分类、标签、日期范围、金额范围筛选记录', en: 'Filter records by keyword, category, tag, date range, and amount range' },
  'guide.records.detailed.grid2_0_label': { zh: '搜索筛选', en: 'Search & Filter' },
  'guide.records.detailed.grid2_1_desc': { zh: '只看那些已经超出预算的分类中的记录', en: 'Show only records from categories that have exceeded their budget' },
  'guide.records.detailed.grid2_1_label': { zh: '超支分类筛选', en: 'Overspent Category Filter' },
  'guide.records.detailed.grid2_2_desc': { zh: '可按日期/金额/备注/分类排序，支持多个排序条件叠加', en: 'Sort by date/amount/notes/category, with multiple sort conditions stacked' },
  'guide.records.detailed.grid2_2_label': { zh: '多级排序', en: 'Multi-Level Sorting' },
  'guide.records.detailed.grid2_3_desc': { zh: '卡片视图（详情模式）和紧凑视图（列表模式）', en: 'Card view (detailed) and compact view (list)' },
  'guide.records.detailed.grid2_3_label': { zh: '两种视图', en: 'Two Views' },
  'guide.records.detailed.grid2_4_desc': { zh: '可自定义每页显示多少条，通过页码翻页', en: 'Customize how many records to show per page, navigate by page numbers' },
  'guide.records.detailed.grid2_4_label': { zh: '分页浏览', en: 'Paginated Browsing' },
  'guide.records.detailed.grid2_5_desc': { zh: '批量选择后统一删除或修改分类', en: 'Select multiple records to delete or change categories in bulk' },
  'guide.records.detailed.grid2_5_label': { zh: '批量操作', en: 'Batch Operations' },
  'guide.records.detailed.grid2_6_desc': { zh: '点击任意记录即可修改金额、分类、时间、备注、标签', en: 'Tap any record to modify its amount, category, time, notes, and tags' },
  'guide.records.detailed.grid2_6_label': { zh: '编辑记录', en: 'Edit Records' },
  'guide.records.detailed.grid2_7_desc': { zh: '支持软删除（可撤销）和永久删除', en: 'Supports soft delete (undoable) and permanent delete' },
  'guide.records.detailed.grid2_7_label': { zh: '删除/撤销', en: 'Delete / Undo' },
  'guide.records.detailed.grid2_8_desc': { zh: '一键导出带公式和图表数据的 Excel 文件', en: 'One-click export of Excel files with formulas and chart data' },
  'guide.records.detailed.grid2_8_label': { zh: '导出 Excel', en: 'Export Excel' },
  'guide.records.detailed.grid2_9_desc': { zh: '从 localStorage 重新加载数据并刷新所有页面', en: 'Reload data from localStorage and refresh all pages' },
  'guide.records.detailed.grid2_9_label': { zh: '刷新数据', en: 'Refresh Data' },
  'guide.records.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.records.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.records.detailed.heading3': { zh: '🎯 常用场景', en: '🎯 Common Scenarios' },
  'guide.records.detailed.heading4': { zh: '📋 筛选条件说明', en: '📋 Filter Reference' },
  'guide.records.detailed.heading5': { zh: '📋 排序条件说明', en: '📋 Sort Reference' },
  'guide.records.detailed.heading6': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.records.detailed.item3_1': { zh: '【找某笔消费】在搜索框输入备注关键词，或选分类、日期范围来缩小范围', en: '【Find a specific expense】Type a keyword in the search box, or use category/date range to narrow it down' },
  'guide.records.detailed.item3_2': { zh: '【改错了的账】点击那条记录，在弹出的编辑框中修改金额、分类等信息后保存', en: '【Fix a wrong entry】Tap the record, edit the amount, category, etc. in the popup, and save' },
  'guide.records.detailed.item3_3': { zh: '【删掉多余的账】点击记录右上角的 🗑️ 删除。可选"软删除"（可撤销）或"立即删除"', en: '【Remove unwanted records】Tap the 🗑️ button on a record. Choose “Soft Delete” (undoable) or “Delete Now”' },
  'guide.records.detailed.item3_4': { zh: '【批量改分类】点击"☑️ 选择"进入批量模式，选中多条记录，点击"批量修改分类"', en: '【Batch change categories】Tap “☑️ Select” to enter batch mode, pick multiple records, then tap “Batch Change Category”' },
  'guide.records.detailed.item3_5': { zh: '【导出分析】点击"📥 导出 Excel"下载完整报表，包含 5 个工作表', en: '【Export for analysis】Tap “📥 Export Excel” to download a full report with 5 worksheets' },
  'guide.records.detailed.row4_0_desc': { zh: '搜索备注中包含的文字，不区分大小写，边输入边筛选', en: 'Search by text in the notes field, case-insensitive, filters as you type' },
  'guide.records.detailed.row4_0_label': { zh: '关键词', en: 'Keyword' },
  'guide.records.detailed.row4_1_desc': { zh: '选择某个分类后，只显示该分类及其子分类的记录', en: 'Select a category to show only records from that category and its subcategories' },
  'guide.records.detailed.row4_1_label': { zh: '分类', en: 'Category' },
  'guide.records.detailed.row4_2_desc': { zh: '选择标签后只显示包含该标签的记录，支持多标签（任一匹配）', en: 'Show only records with the selected tag, multi-tag support (any match)' },
  'guide.records.detailed.row4_2_label': { zh: '标签', en: 'Tag' },
  'guide.records.detailed.row4_3_desc': { zh: '开始日期 ~ 结束日期，结束日期包含当天全天', en: 'Start date ~ end date, end date includes the full day' },
  'guide.records.detailed.row4_3_label': { zh: '日期范围', en: 'Date Range' },
  'guide.records.detailed.row4_4_desc': { zh: '最低金额 ~ 最高金额，边输入边筛选', en: 'Minimum ~ maximum amount, filters as you type' },
  'guide.records.detailed.row4_4_label': { zh: '金额范围', en: 'Amount Range' },
  'guide.records.detailed.row4_5_desc': { zh: '只显示当月预算已超支的分类中的记录', en: 'Show only records from categories that have exceeded their monthly budget' },
  'guide.records.detailed.row4_5_label': { zh: '超支分类', en: 'Overspent Categories' },
  'guide.records.detailed.row5_0_desc': { zh: '可按日期、金额、备注文字、分类名称排序', en: 'Sort by date, amount, notes text, or category name' },
  'guide.records.detailed.row5_0_label': { zh: '排序字段', en: 'Sort Field' },
  'guide.records.detailed.row5_1_desc': { zh: '↑ 正序（从小到大） / ↓ 倒序（从大到小）', en: '↑ Ascending (small to large) / ↓ Descending (large to small)' },
  'guide.records.detailed.row5_1_label': { zh: '排序方向', en: 'Sort Direction' },
  'guide.records.detailed.row5_2_desc': { zh: '点击"＋ 添加排序"可以叠加多个条件，如先按分类排、再按金额排', en: 'Click “+ Add Sort” to stack multiple conditions, e.g. sort by category first, then by amount' },
  'guide.records.detailed.row5_2_label': { zh: '多级排序', en: 'Multi-Level Sort' },
  'guide.records.detailed.text1': { zh: '「流水」是全部记账记录的列表页面。你可以在这里搜索、筛选、排序、查看、修改和删除每一笔记录。所有你记过的账都能在这里找到。', en: '“Records” is the complete list of all your transaction records. You can search, filter, sort, view, edit, and delete every entry here. Every transaction you’ve ever recorded can be found here.' },
  'guide.records.detailed.tip6_1': { zh: '排序设置会自动保存，下次打开页面还在', en: 'Sort settings are saved automatically and persist when you reopen the page' },
  'guide.records.detailed.tip6_2': { zh: '紧凑视图和每页条数也会自动保存', en: 'Compact view and page size are also saved automatically' },
  'guide.records.detailed.tip6_3': { zh: '筛选条件不会自动保存，刷新页面后重置', en: 'Filter conditions are not saved and reset on page refresh' },
  'guide.records.detailed.tip6_4': { zh: '软删除后 5 秒内可以点击"撤销"恢复，超过 5 秒就固定删除了。注意：只有最后一次删除可以撤销', en: 'After a soft delete, you have 5 seconds to click “Undo” to restore. After 5 seconds it’s final. Note: only the most recent delete can be undone' },
  'guide.records.detailed.tip6_5': { zh: '在手机上左右滑动记录卡片可以快速弹出删除按钮', en: 'Swipe left or right on a record card on mobile to quickly reveal the delete button' },
  'guide.records.detailed.tip6_6': { zh: '点击记录卡片任意位置即可编辑，包括修改标签', en: 'Tap anywhere on a record card to edit it, including changing tags' },
  'guide.records.detailed.tip6_7': { zh: '从 Waffle 图点击标签跳转过来时，会自动筛选该标签的记录', en: 'When you click a tag from the Waffle chart and jump here, records are automatically filtered by that tag' },
  'guide.records.simple.heading1': { zh: '📖 所有记账记录的列表', en: '📖 A Complete List of All Records' },
  'guide.records.simple.heading2': { zh: '🎯 常用操作', en: '🎯 Common Operations' },
  'guide.records.simple.heading3': { zh: '💡 快速提示', en: '💡 Quick Tips' },
  'guide.records.simple.item2_1': { zh: '【查找】在搜索框输入关键词，或按分类/日期筛选', en: '【Find】Search by keyword in the search box, or filter by category/date' },
  'guide.records.simple.item2_2': { zh: '【修改】点击任意记录，在弹出的框中修改金额、分类等', en: '【Edit】Tap any record to modify its amount, category, etc. in the popup' },
  'guide.records.simple.item2_3': { zh: '【删除】点击记录上的 🗑️ 按钮，可选软删除（可撤销）或永久删除', en: '【Delete】Tap the 🗑️ button on a record, choose soft delete (undoable) or permanent delete' },
  'guide.records.simple.item2_4': { zh: '【导出】点击「📥 导出 Excel」下载完整报表', en: '【Export】Tap “📥 Export Excel” to download a full report' },
  'guide.records.simple.text1': { zh: '在这里搜索、查看、修改、删除每一笔记录。也支持批量操作和导出Excel。', en: 'Search, view, edit, and delete every record here. Batch operations and Excel export are also supported.' },
  'guide.records.simple.tip3_1': { zh: '排序设置、紧凑视图、每页条数都会自动保存', en: 'Sort settings, compact view, and page size are all saved automatically' },
  'guide.records.simple.tip3_2': { zh: '软删除后 5 秒内可以点"撤销"恢复', en: 'After a soft delete, you can click “Undo” within 5 seconds to restore' },
  'guide.records.simple.tip3_3': { zh: '支持按标签筛选记录——在搜索区点击「🏷️ 筛选标签」选择标签', en: 'Filter records by tag — click “🏷️ Filter Tags” in the search area' },
  'guide.records.simple.tip3_4': { zh: '编辑记录时可以添加、删除标签', en: 'You can add or remove tags when editing a record' },
  'guide.records.title': { zh: '📋 流水', en: '📋 Records' },
  'guide.report.detailed.grid2_0_desc': { zh: '选择要查看的月份，默认当月', en: 'Select which month to view; defaults to the current month' },
  'guide.report.detailed.grid2_0_label': { zh: '月份选择', en: 'Month Picker' },
  'guide.report.detailed.grid2_1_desc': { zh: '月收入、总支出、储蓄、储蓄率四联卡片', en: 'Four summary cards: monthly income, total spending, savings, and savings rate' },
  'guide.report.detailed.grid2_1_label': { zh: '核心指标', en: 'Key Metrics' },
  'guide.report.detailed.grid2_2_desc': { zh: '收入 vs 支出的环形可视化图', en: 'Visual ring chart comparing income vs spending' },
  'guide.report.detailed.grid2_2_label': { zh: '预算进度环', en: 'Budget Progress Ring' },
  'guide.report.detailed.grid2_3_desc': { zh: '预计储蓄 vs 储蓄目标的对比图', en: 'Comparison chart of projected savings vs savings goal' },
  'guide.report.detailed.grid2_3_label': { zh: '储蓄进度环', en: 'Savings Progress Ring' },
  'guide.report.detailed.grid2_4_desc': { zh: '每个分类的预算、支出、占比、剩余、状态完整表格', en: 'Full table with budget, spending, percentage, remaining, and status for each category' },
  'guide.report.detailed.grid2_4_label': { zh: '分类明细表', en: 'Category Breakdown Table' },
  'guide.report.detailed.grid2_5_desc': { zh: '当月每天消费的折线图', en: 'Line chart of daily spending for the month' },
  'guide.report.detailed.grid2_5_label': { zh: '每日趋势图', en: 'Daily Trend Chart' },
  'guide.report.detailed.grid2_6_desc': { zh: '花钱最多的 5 个分类排行', en: 'Ranking of the 5 most expensive categories' },
  'guide.report.detailed.grid2_6_label': { zh: '支出排行 TOP 5', en: 'Top 5 Spending Categories' },
  'guide.report.detailed.grid2_7_desc': { zh: '一句话总结：按当前趋势月底能存多少钱', en: 'One-line summary: how much you’ll save by month-end at the current pace' },
  'guide.report.detailed.grid2_7_label': { zh: '储蓄预测总结', en: 'Savings Forecast Summary' },
  'guide.report.detailed.grid2_8_desc': { zh: '一键调起浏览器打印功能', en: 'One-click browser print function' },
  'guide.report.detailed.grid2_8_label': { zh: '打印报告', en: 'Print Report' },
  'guide.report.detailed.grid2_9_desc': { zh: '跟随「设置」页的统计范围（本月/近30天），自动适配数据', en: 'Follows the Settings page’s statistics range (This Month / Last 30 Days), auto-adapts data' },
  'guide.report.detailed.grid2_9_label': { zh: '统计范围切换', en: 'Statistics Range Switcher' },
  'guide.report.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.report.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.report.detailed.heading3': { zh: '🎯 如何使用', en: '🎯 How to Use' },
  'guide.report.detailed.heading4': { zh: '📋 指标说明', en: '📋 Metric Reference' },
  'guide.report.detailed.heading5': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.report.detailed.item3_1': { zh: '打开页面后默认为当月报告，所有数据自动生成', en: 'The page opens to the current month’s report by default; all data is auto-generated' },
  'guide.report.detailed.item3_2': { zh: '点击月份选择器切换其他月份', en: 'Click the month picker to switch to another month' },
  'guide.report.detailed.item3_3': { zh: '查看核心指标卡片了解当月财务状况', en: 'Review the key metric cards for a snapshot of the month’s finances' },
  'guide.report.detailed.item3_4': { zh: '滚动查看各分类的预算完成情况', en: 'Scroll down to see each category’s budget progress' },
  'guide.report.detailed.item3_5': { zh: '点击「🖨️ 打印报告」打印或导出为 PDF', en: 'Click “🖨️ Print Report” to print or export as PDF' },
  'guide.report.detailed.row4_0_desc': { zh: '你在月账单中心设置的当月收入金额', en: 'Your income amount for the month, as set in Bill Center' },
  'guide.report.detailed.row4_0_label': { zh: '月收入', en: 'Monthly Income' },
  'guide.report.detailed.row4_1_desc': { zh: '当月日常消费合计（不含账单支出）', en: 'Monthly daily spending total (excluding bill payments)' },
  'guide.report.detailed.row4_1_label': { zh: '总支出', en: 'Total Spending' },
  'guide.report.detailed.row4_2_desc': { zh: '月收入 − 总支出 − 未付账单，正数表示有结余', en: 'Monthly income − total spending − unpaid bills. A positive amount means you’re in the black' },
  'guide.report.detailed.row4_2_label': { zh: '储蓄', en: 'Savings' },
  'guide.report.detailed.row4_3_desc': { zh: '储蓄 ÷ 月收入 × 100%，≥ 20% 显示绿色', en: 'Savings ÷ monthly income × 100%. Displays green when ≥ 20%' },
  'guide.report.detailed.row4_3_label': { zh: '储蓄率', en: 'Savings Rate' },
  'guide.report.detailed.row4_4_desc': { zh: '总支出占可支配收入（收入−账单）的比例', en: 'Total spending as a percentage of disposable income (income − bills)' },
  'guide.report.detailed.row4_4_label': { zh: '预算环', en: 'Budget Ring' },
  'guide.report.detailed.row4_5_desc': { zh: '预计储蓄占储蓄目标的比例', en: 'Projected savings as a percentage of the savings goal' },
  'guide.report.detailed.row4_5_label': { zh: '储蓄环', en: 'Savings Ring' },
  'guide.report.detailed.row4_6_desc': { zh: '✅ 预算内 / ⚠️ 超支，红色背景行表示超支', en: '✅ Within budget / ⚠️ Overspent. Red background rows indicate overspending' },
  'guide.report.detailed.row4_6_label': { zh: '分类预算状态', en: 'Category Budget Status' },
  'guide.report.detailed.text1': { zh: '「月度报告」是一个适合打印或截图分享的月度财务总结页面。它把某个月的收入、支出、储蓄、预算完成情况整理成一份简洁的报告，包含数据摘要、环形图、分类明细表和储蓄预测。适合月底复盘或与家人分享。', en: '“Monthly Report” is a print-friendly, shareable monthly financial summary. It compiles a month’s income, expenses, savings, and budget status into a clean report featuring a data summary, ring charts, a category breakdown table, and a savings forecast. Perfect for month-end reviews or sharing with family.' },
  'guide.report.detailed.tip5_1': { zh: '报告的打印样式已经优化，打印时只显示核心内容，隐藏导航和按钮', en: 'The report print style has been optimized — printing shows only the core content, hiding navigation and buttons' },
  'guide.report.detailed.tip5_2': { zh: '分类明细表中，没有设置预算的分类会显示"—"', en: 'Categories without a budget set will display “—” in the breakdown table' },
  'guide.report.detailed.tip5_3': { zh: '储蓄预测总结会告诉你如果维持当前习惯月底能存多少钱', en: 'The savings forecast tells you how much you could save by month-end if you maintain your current habits' },
  'guide.report.simple.heading1': { zh: '📖 一页纸的财务总结', en: '📖 A One-Page Financial Summary' },
  'guide.report.simple.heading2': { zh: '🎯 使用方式', en: '🎯 How to Use' },
  'guide.report.simple.item2_1': { zh: '打开即显示当月报告，所有数据自动生成', en: 'Opens to the current month’s report automatically; all data is generated on the fly' },
  'guide.report.simple.item2_2': { zh: '点击月份选择器切换其他月份', en: 'Click the month picker to switch to another month' },
  'guide.report.simple.item2_3': { zh: '统计范围跟随「设置」页的「本月」/「近30天」切换', en: 'The statistics scope follows the “This Month” / “Last 30 Days” setting in Settings' },
  'guide.report.simple.item2_4': { zh: '点击「🖨️ 打印报告」打印或导出为 PDF', en: 'Click “🖨️ Print Report” to print or export as PDF' },
  'guide.report.simple.text1': { zh: '和「统计」页不同，报告是一页纸格式的简洁总结，<strong>适合截图或打印</strong>。包含收支环形图、分类预算明细表和一句话储蓄预测，月底看这一页就够了。', en: 'Unlike the “Statistics” page, the report is a clean one-page summary <strong>perfect for screenshots or printing</strong>. It includes an income/expense ring chart, a category budget breakdown table, and a one-line savings forecast. All you need at month-end.' },
  'guide.report.title': { zh: '📋 月度报告', en: '📋 Monthly Report' },
  'guide.settings.detailed.grid2_0_desc': { zh: '一键切换主题配色', en: 'One-click theme toggle' },
  'guide.settings.detailed.grid2_0_label': { zh: '深色/浅色模式', en: 'Dark / Light Mode' },
  'guide.settings.detailed.grid2_1_desc': { zh: '设置每月固定金额储蓄、收入百分比储蓄，或两者都设', en: 'Set a fixed monthly savings amount, a percentage of income, or both' },
  'guide.settings.detailed.grid2_1_label': { zh: '储蓄目标', en: 'Savings Goal' },
  'guide.settings.detailed.grid2_10_desc': { zh: '查看所有已使用的标签及其花费统计，可删除无用标签', en: 'View all used tags and their spending statistics; delete unused tags' },
  'guide.settings.detailed.grid2_10_label': { zh: '标签管理', en: 'Tag Management' },
  'guide.settings.detailed.grid2_2_desc': { zh: '导出为 JSON / Excel（含公式）/ CSV 格式', en: 'Export as JSON / Excel (with formulas) / CSV formats' },
  'guide.settings.detailed.grid2_2_label': { zh: '数据导出', en: 'Data Export' },
  'guide.settings.detailed.grid2_3_desc': { zh: '导入 JSON 文件（替换或合并现有数据）', en: 'Import JSON files (replace or merge with existing data)' },
  'guide.settings.detailed.grid2_3_label': { zh: '数据导入', en: 'Data Import' },
  'guide.settings.detailed.grid2_4_desc': { zh: '通过 WebRTC 在同一 WiFi 下与其他设备直连同步数据', en: 'Direct peer-to-peer sync over WebRTC on the same WiFi network' },
  'guide.settings.detailed.grid2_4_label': { zh: '局域网同步', en: 'LAN Sync' },
  'guide.settings.detailed.grid2_5_desc': { zh: '清空所有记录、分类和设置（不可恢复）', en: 'Delete all records, categories, and settings (irreversible)' },
  'guide.settings.detailed.grid2_5_label': { zh: '清除数据', en: 'Clear Data' },
  'guide.settings.detailed.grid2_6_desc': { zh: '从本地存储重新加载数据，清理异常状态。如果觉得数据不对可以试试这个', en: 'Reload data from local storage and clean up anomalous states. Try this if data seems off' },
  'guide.settings.detailed.grid2_6_label': { zh: '数据修复', en: 'Data Repair' },
  'guide.settings.detailed.grid2_7_desc': { zh: '数据一致性检查、存储用量、统计引擎审计、操作日志', en: 'Consistency checks, storage usage, statistics engine audit, and operation logs' },
  'guide.settings.detailed.grid2_7_label': { zh: '数据诊断', en: 'Data Diagnostics' },
  'guide.settings.detailed.grid2_8_desc': { zh: '设置 PIN 码后数据使用 Web Crypto API (AES-GCM) 加密存储，支持自定义自动锁定时间', en: 'When a PIN is set, data is encrypted using the Web Crypto API (AES-GCM). Supports custom auto-lock timeout' },
  'guide.settings.detailed.grid2_8_label': { zh: 'PIN 锁加密', en: 'PIN Lock Encryption' },
  'guide.settings.detailed.grid2_9_desc': { zh: '全局切换「本月」/「近30天」统计口径，影响总览、统计、报告、流水、假设分析页面', en: 'Globally switch between “This Month” and “Last 30 Days”; affects overview, statistics, report, records, and what-if analysis pages' },
  'guide.settings.detailed.grid2_9_label': { zh: '统计范围切换', en: 'Statistics Range Switcher' },
  'guide.settings.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.settings.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.settings.detailed.heading3': { zh: '📋 储蓄目标说明', en: '📋 Savings Goal Reference' },
  'guide.settings.detailed.heading4': { zh: '📋 数据管理说明', en: '📋 Data Management Reference' },
  'guide.settings.detailed.heading5': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.settings.detailed.row3_0_desc': { zh: '每月固定存多少钱，如每月存 RM 500', en: 'Save a fixed amount each month, e.g. RM 500' },
  'guide.settings.detailed.row3_0_label': { zh: '固定金额', en: 'Fixed Amount' },
  'guide.settings.detailed.row3_1_desc': { zh: '每月存月收入的百分之几，如存 20%', en: 'Save a percentage of monthly income, e.g. 20%' },
  'guide.settings.detailed.row3_1_label': { zh: '百分比', en: 'Percentage' },
  'guide.settings.detailed.row3_2_desc': { zh: '同时设置固定金额 + 百分比。如固定 RM 200 + 10%，总收入 RM 3000 则存 RM 200 + RM 300 = RM 500', en: 'Set both a fixed amount and a percentage. E.g. fixed RM 200 + 10%, income RM 3000 = RM 200 + RM 300 = RM 500 saved' },
  'guide.settings.detailed.row3_2_label': { zh: '两者', en: 'Both' },
  'guide.settings.detailed.row3_3_desc': { zh: '纯收入（总收入）或净收入（总收入 − 账单总额）', en: 'Gross income (total income) or net income (total income − total bills)' },
  'guide.settings.detailed.row3_3_label': { zh: '百分比基准', en: 'Percentage Base' },
  'guide.settings.detailed.row4_0_desc': { zh: '完整数据备份，包含所有记录、分类、预算、设置', en: 'Full data backup including all records, categories, budgets, and settings' },
  'guide.settings.detailed.row4_0_label': { zh: '导出 JSON', en: 'Export JSON' },
  'guide.settings.detailed.row4_1_desc': { zh: '可替换当前全部数据，或合并到现有数据中', en: 'Replace all current data or merge into existing data' },
  'guide.settings.detailed.row4_1_label': { zh: '导入 JSON', en: 'Import JSON' },
  'guide.settings.detailed.row4_2_desc': { zh: '生成带公式的 .xlsx 文件，包含 5 个工作表：消费记录、分类统计、月度统计、预算跟踪、储蓄统计', en: 'Generates a .xlsx file with formulas, containing 5 worksheets: transaction records, category statistics, monthly statistics, budget tracking, and savings statistics' },
  'guide.settings.detailed.row4_2_label': { zh: '导出 Excel', en: 'Export Excel' },
  'guide.settings.detailed.row4_3_desc': { zh: '所有消费记录的逗号分隔文本文件，可用 Excel/WPS 打开', en: 'Comma-separated text file of all transaction records, openable in Excel/WPS' },
  'guide.settings.detailed.row4_3_label': { zh: '导出 CSV', en: 'Export CSV' },
  'guide.settings.detailed.row4_4_desc': { zh: '两台设备在同一 WiFi 下直连同步，不经过服务器。需手动交换连接码', en: 'Two devices on the same WiFi sync directly without a server. Requires manually exchanging a connection code' },
  'guide.settings.detailed.row4_4_label': { zh: '局域网同步', en: 'LAN Sync' },
  'guide.settings.detailed.row4_5_desc': { zh: '不可逆操作，执行前建议先导出 JSON 备份', en: 'Irreversible operation. It is recommended to export a JSON backup first' },
  'guide.settings.detailed.row4_5_label': { zh: '清除所有数据', en: 'Clear All Data' },
  'guide.settings.detailed.text1': { zh: '「设置」是应用配置中心。你可以在这里切换深色/浅色模式、配置储蓄目标、导入/导出数据、通过局域网同步到其他设备，以及使用内置的数据诊断工具检查数据一致性。', en: '“Settings” is the app configuration center. You can toggle dark/light mode, configure savings goals, import/export data, sync to other devices over LAN, and use the built-in data diagnostics tool to check data consistency.' },
  'guide.settings.detailed.tip5_1': { zh: '修改储蓄目标后记得点击"💾 保存目标"按钮', en: 'Remember to click the “💾 Save Goal” button after changing your savings goal' },
  'guide.settings.detailed.tip5_2': { zh: '数据诊断区的"统计引擎审计"可以查看指定月份统计引擎用到了哪些记录', en: 'The “Statistics Engine Audit” in the Data Diagnostics section shows which records the statistics engine used for a given month' },
  'guide.settings.detailed.tip5_3': { zh: '两台设备数据完全一致时，数据同步校验区的指纹码会相同', en: 'When two devices have identical data, their fingerprint codes in the data sync verification section will match' },
  'guide.settings.detailed.tip5_4': { zh: '版本号显示在页面最底部', en: 'The version number is displayed at the very bottom of the page' },
  'guide.settings.detailed.tip5_5': { zh: '启用 PIN 锁后，建议设置自动锁定时间（如 5 分钟），离开电脑自动锁定', en: 'After enabling the PIN lock, it’s recommended to set an auto-lock timeout (e.g. 5 minutes) so it locks when you step away' },
  'guide.settings.detailed.tip5_6': { zh: '近30天模式在月初（1-10日）特别有用，数据样本更稳定', en: '“Last 30 Days” mode is especially useful early in the month (1st–10th) when data samples are more stable' },
  'guide.settings.simple.heading1': { zh: '📖 应用配置中心', en: '📖 App Configuration Center' },
  'guide.settings.simple.heading2': { zh: '🎯 常用设置', en: '🎯 Common Settings' },
  'guide.settings.simple.item2_1': { zh: '【储蓄目标】选择固定金额或按收入百分比存钱，设好后点击「💾 保存目标」', en: '【Savings Goal】Choose a fixed amount or a percentage of income. After setting, click “💾 Save Goal”' },
  'guide.settings.simple.item2_2': { zh: '【备份数据】定期点「📥 导出 JSON」下载备份，换手机或清数据前一定要做', en: '【Backup Data】Regularly click “📥 Export JSON” to download a backup — essential before switching phones or clearing data' },
  'guide.settings.simple.item2_3': { zh: '【同步设备】家里有多台设备？用「📶 局域网同步」在同 WiFi 下直接同步，不需要服务器', en: '【Sync Devices】Multiple devices at home? Use “📶 LAN Sync” over the same WiFi — no server needed' },
  'guide.settings.simple.item2_4': { zh: '【数据诊断】如果觉得数据显示不对，可以看看「数据诊断」区检查一致性', en: '【Data Diagnostics】If data looks wrong, check the “Data Diagnostics” section to verify consistency' },
  'guide.settings.simple.item2_5': { zh: '【PIN锁保护】在「安全设置」区启用 PIN 码，数据将用 AES-GCM 加密存储，支持自定义自动锁定时间', en: '【PIN Lock Protection】Enable a PIN in the “Security Settings” section; data will be encrypted with AES-GCM. Custom auto-lock timeout supported' },
  'guide.settings.simple.item2_6': { zh: '【统计范围】在「统计范围」区切换「本月」/「近30天」，月初数据少时切到近30天更稳定', en: '【Statistics Range】Switch between “This Month” and “Last 30 Days” in the “Statistics Range” section. Early in the month, switching to “Last 30 Days” gives more stable data' },
  'guide.settings.simple.text1': { zh: '切换深色模式、设置储蓄目标、备份数据、同步设备。日常用得最多的是储蓄目标设置。', en: 'Toggle dark mode, set savings goals, back up your data, and sync across devices. The most commonly used feature is the savings goal setting.' },
  'guide.settings.title': { zh: '⚙️ 设置', en: '⚙️ Settings' },
  'guide.stats.detailed.grid2_0_desc': { zh: '按月查看或自定义日期范围', en: 'View by month or set a custom date range' },
  'guide.stats.detailed.grid2_0_label': { zh: '时间选择', en: 'Time Selection' },
  'guide.stats.detailed.grid2_1_desc': { zh: '总支出、日均、预测总支出、储蓄预测等核心指标', en: 'Key metrics: total spending, daily average, projected total, savings forecast' },
  'guide.stats.detailed.grid2_1_label': { zh: '汇总卡片', en: 'Summary Cards' },
  'guide.stats.detailed.grid2_10_desc': { zh: '数据范围基于「本月」或「近30天」，在设置页切换，所有图表联动更新', en: 'Data range based on “This Month” or “Last 30 Days,” toggled in Settings; all charts update in sync' },
  'guide.stats.detailed.grid2_10_label': { zh: '统计范围切换', en: 'Statistics Range Switcher' },
  'guide.stats.detailed.grid2_2_desc': { zh: '交易笔数、平均每笔、单笔最高、最高消费日', en: 'Number of transactions, average per transaction, highest single expense, biggest spending day' },
  'guide.stats.detailed.grid2_2_label': { zh: '交易分析', en: 'Transaction Analysis' },
  'guide.stats.detailed.grid2_3_desc': { zh: '日历形式展示每天消费强度，颜色越深花越多', en: 'Calendar-style view of daily spending intensity; darker colors mean more spending' },
  'guide.stats.detailed.grid2_3_label': { zh: '消费热力图', en: 'Spending Heatmap' },
  'guide.stats.detailed.grid2_4_desc': { zh: '各分类支出占比，可下钻查看子分类明细', en: 'Category spending proportions, drill down into subcategories' },
  'guide.stats.detailed.grid2_4_label': { zh: '饼图', en: 'Pie Chart' },
  'guide.stats.detailed.grid2_5_desc': { zh: '每天消费金额的折线图，含日均可支配参考线', en: 'Line chart of daily spending, with a reference line for daily disposable income' },
  'guide.stats.detailed.grid2_5_label': { zh: '每日趋势线图', en: 'Daily Trend Line Chart' },
  'guide.stats.detailed.grid2_6_desc': { zh: '本月 vs 上月各分类支出对比', en: 'Compare spending by category between this month and last month' },
  'guide.stats.detailed.grid2_6_label': { zh: '月度对比柱状图', en: 'Month Comparison Bar Chart' },
  'guide.stats.detailed.grid2_7_desc': { zh: '月度总支出和储蓄趋势曲线/柱状图', en: 'Monthly total spending and savings trend as a line/bar chart' },
  'guide.stats.detailed.grid2_7_label': { zh: '近 6 个月趋势', en: '6-Month Trend' },
  'guide.stats.detailed.grid2_8_desc': { zh: '每个分类的预算完成情况进度条', en: 'Budget completion progress bar for each category' },
  'guide.stats.detailed.grid2_8_label': { zh: '分类预算进度', en: 'Category Budget Progress' },
  'guide.stats.detailed.grid2_9_desc': { zh: '每个图表都支持下载为 PNG 图片', en: 'Every chart can be downloaded as a PNG image' },
  'guide.stats.detailed.grid2_9_label': { zh: '下载截图', en: 'Screenshot Export' },
  'guide.stats.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.stats.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.stats.detailed.heading3': { zh: '⚠️ 前提条件', en: '⚠️ Prerequisites' },
  'guide.stats.detailed.heading4': { zh: '🎯 常用场景', en: '🎯 Common Scenarios' },
  'guide.stats.detailed.heading5': { zh: '📋 图表说明', en: '📋 Chart Reference' },
  'guide.stats.detailed.heading6': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.stats.detailed.item4_1': { zh: '【看月度总结】选择月份，查看汇总卡片了解本月核心数据', en: '【View monthly summary】Pick a month and check the summary cards for key metrics' },
  'guide.stats.detailed.item4_2': { zh: '【分析消费结构】看饼图了解钱花在哪些分类上了，点击切片下钻', en: '【Analyze spending structure】Look at the pie chart, click slices to drill down' },
  'guide.stats.detailed.item4_3': { zh: '【找消费规律】看每日趋势线图和热力图，找出消费高峰日', en: '【Find spending patterns】Check the daily trend line and heatmap to spot peak spending days' },
  'guide.stats.detailed.item4_4': { zh: '【对比变化】开启「月度对比」看看本月和上月的分类支出变化', en: '【Compare changes】Enable “Month Comparison” to see how category spending changed vs last month' },
  'guide.stats.detailed.item4_5': { zh: '【长期趋势】看近 6 个月的月度趋势，了解消费是在涨还是降', en: '【Long-term trends】Review the 6-month trend to understand whether spending is going up or down' },
  'guide.stats.detailed.row5_0_desc': { zh: '日历网格，每天一个格子。颜色越深表示当天消费越高。点击某天可查看当天的详细记录', en: 'Calendar grid, one cell per day. Darker color means higher spending. Click a day to view its detailed records' },
  'guide.stats.detailed.row5_0_label': { zh: '消费热力图', en: 'Spending Heatmap' },
  'guide.stats.detailed.row5_1_desc': { zh: '各分类支出比例。点击饼图切片可下钻查看子分类。勾选"含账单"切换是否包含账单支出', en: 'Proportion of each category’s spending. Click a slice to drill into subcategories. Toggle “Include Bills” to include or exclude bill expenses' },
  'guide.stats.detailed.row5_1_label': { zh: '分类饼图', en: 'Category Pie Chart' },
  'guide.stats.detailed.row5_2_desc': { zh: '每天支出折线图。虚线是"日均可支配"参考线（收入−账单−储蓄后÷天数）', en: 'Line chart of daily spending. The dashed line is the “daily disposable income” reference line (income − bills − savings ÷ days)' },
  'guide.stats.detailed.row5_2_label': { zh: '每日趋势', en: 'Daily Trend' },
  'guide.stats.detailed.row5_3_desc': { zh: '本月与上月各分类支出对比柱状图。需要手动开启', en: 'Bar chart comparing this month’s category spending vs last month. Requires manual activation' },
  'guide.stats.detailed.row5_3_label': { zh: '月度对比', en: 'Month Comparison' },
  'guide.stats.detailed.row5_4_desc': { zh: '近半年每月总支出的折线图，以及月度储蓄柱状图（储蓄为负时用红柱表示，即当月支出超过收入）', en: 'Line chart of total monthly spending over the past six months, plus monthly savings bars (red when savings are negative, meaning spending exceeded income)' },
  'guide.stats.detailed.row5_4_label': { zh: '近 6 月趋势', en: '6-Month Trend' },
  'guide.stats.detailed.row5_5_desc': { zh: '方格矩阵，每格代表一定金额。标签按花费从大到小从左到右排列。悬停显示标签名+金额+占比。点击格子或图例可跳转流水页筛选该标签。支持独立时间段、自定义标签颜色、导出 PNG。右上角密度选择器可调 5 档（24~600 格）。', en: 'A grid where each cell represents a fixed amount. Tags are arranged from largest to smallest left to right. Hover shows tag name + amount + percentage. Click a cell or legend to jump to records filtered by that tag. Supports independent time range, custom tag colors, and PNG export. The density selector in the top-right corner offers 5 levels (24–600 cells).' },
  'guide.stats.detailed.row5_5_label': { zh: '标签分布 Waffle 图', en: 'Tag Distribution Waffle Chart' },
  'guide.stats.detailed.text1': { zh: '「统计」是数据分析页面，用图表和数字展示你的消费模式。你可以查看任意月份或自定义时间段的数据，包括分类占比、每日趋势、月度对比、消费热力图等。适合深入了解自己的消费习惯。', en: '“Statistics” is the data analysis page, using charts and numbers to visualize your spending patterns. You can view data for any month or custom period, including category breakdowns, daily trends, month-over-month comparisons, and spending heatmaps. It’s ideal for understanding your spending habits in depth.' },
  'guide.stats.detailed.text3': { zh: '• 需要至少有一个月的记账数据<br>• 预算/收入相关分析需在「月账单中心」设置收入<br>• 分类预算进度需要先在「分类」页面设置预算<br>• 按月查看和自定义范围是互斥的，选一个会自动清空另一个', en: '• At least one month of transaction data<br>• Budget/income analysis requires setting your income in “Bill Center”<br>• Category budget progress requires setting budgets on the “Categories” page first<br>• Monthly view and custom range are mutually exclusive; selecting one clears the other' },
  'guide.stats.detailed.tip6_1': { zh: '点击热力图中的某一天可以快速查看和编辑那天的所有记录', en: 'Click a day on the heatmap to quickly view and edit all records from that day' },
  'guide.stats.detailed.tip6_2': { zh: '饼图和柱状图支持联动下钻——点饼图再点柱状图会同步下钻', en: 'The pie chart and bar chart support linked drill-down — clicking the pie chart and then the bar chart will sync the drill-down' },
  'guide.stats.detailed.tip6_3': { zh: '所有图表右上角都有「⛶ 展开」按钮，可以全屏查看', en: 'Every chart has a “⛶ Expand” button in the top-right corner for full-screen viewing' },
  'guide.stats.detailed.tip6_4': { zh: '「📥 下载 PNG」按钮可以把每个图表保存为图片', en: 'The “📥 Download PNG” button saves each chart as an image' },
  'guide.stats.detailed.tip6_5': { zh: '推荐查看顺序：先看汇总卡片了解整体 → 再看饼图分析消费结构 → 然后看每日趋势找规律 → 最后看热力图找消费高峰日', en: 'Recommended viewing order: summary cards for an overview → pie chart for spending structure → daily trends for patterns → heatmap for peak spending days' },
  'guide.stats.simple.heading1': { zh: '📖 用图表分析消费习惯', en: '📖 Analyze Spending Habits with Charts' },
  'guide.stats.simple.heading2': { zh: '🎯 推荐查看顺序', en: '🎯 Recommended Viewing Order' },
  'guide.stats.simple.heading3': { zh: '💡 快速提示', en: '💡 Quick Tips' },
  'guide.stats.simple.item2_1': { zh: '先看汇总卡片了解核心数据（总支出、日均、预测）', en: 'Start with the summary cards for key metrics (total, daily avg, projection)' },
  'guide.stats.simple.item2_2': { zh: '再看饼图分析钱花在哪些分类上了', en: 'Then look at the pie chart to see where your money is going' },
  'guide.stats.simple.item2_3': { zh: '然后看每日趋势和热力图找消费规律', en: 'Then check daily trends and heatmaps to find spending patterns' },
  'guide.stats.simple.item2_4': { zh: '最后看近 6 个月趋势了解消费变化方向', en: 'Finally, review the 6-month trend to understand where spending is headed' },
  'guide.stats.simple.text1': { zh: '查看任意月份或自定义时间段的消费数据：分类占比、每日趋势、月度对比、消费热力图。', en: 'View spending data for any month or custom period: category breakdowns, daily trends, month-over-month comparisons, and spending heatmaps.' },
  'guide.stats.simple.tip3_1': { zh: '点击热力图上的某一天可以查看和编辑那天的所有记录', en: 'Click a day on the heatmap to view and edit all records from that day' },
  'guide.stats.simple.tip3_2': { zh: '所有图表都支持「⛶ 展开」全屏和「📥 下载 PNG」', en: 'All charts support “⛶ Expand” to full-screen and “📥 Download PNG”' },
  'guide.stats.simple.tip3_3': { zh: '新增 Waffle Chart 方格图——在页面底部查看标签分布，支持 5 档密度调节、悬停动效、独立时间段选择', en: 'New Waffle Chart at the bottom of the page shows tag distribution, with 5 density levels, hover effects, and independent time range selection' },
  'guide.stats.simple.tip3_4': { zh: '统计范围可在「设置」页切换「本月」/「近30天」，月初数据少时推荐用近30天', en: 'You can switch between “This Month” and “Last 30 Days” in Settings — early in the month, “Last 30 Days” gives more stable data' },
  'guide.stats.title': { zh: '📈 统计', en: '📈 Statistics' },
  'guide.toggle.detailed': { zh: '切换到详尽模式', en: 'Switch to Detailed Mode' },
  'guide.toggle.simple': { zh: '切换到简洁模式', en: 'Switch to Simple Mode' },
  'guide.whatif.detailed.grid2_0_desc': { zh: '对每个分类单独设置未来消费模式', en: 'Set future spending patterns for each category individually' },
  'guide.whatif.detailed.grid2_0_label': { zh: '分类调整', en: 'Category Adjustment' },
  'guide.whatif.detailed.grid2_1_desc': { zh: '6 种调整方式，每个模式都配有具体的生活例子，见下方表格', en: '6 adjustment modes, each with real-life examples (see table below)' },
  'guide.whatif.detailed.grid2_1_label': { zh: '多种模式', en: 'Multiple Modes' },
  'guide.whatif.detailed.grid2_2_desc': { zh: '对所有未单独调整的分类统一设置', en: 'Apply a single adjustment to all categories that haven’t been individually set' },
  'guide.whatif.detailed.grid2_2_label': { zh: '全局调整', en: 'Global Adjustment' },
  'guide.whatif.detailed.grid2_3_desc': { zh: '添加一个现实中不存在的虚构分类，模拟新增消费', en: 'Add a fictional category to simulate new spending' },
  'guide.whatif.detailed.grid2_3_label': { zh: '假设分类', en: 'Hypothetical Category' },
  'guide.whatif.detailed.grid2_4_desc': { zh: '趋势 vs 调整后的总支出、储蓄对比图', en: 'Chart comparing total spending and savings between trend and adjusted scenarios' },
  'guide.whatif.detailed.grid2_4_label': { zh: '结果对比', en: 'Result Comparison' },
  'guide.whatif.detailed.grid2_5_desc': { zh: '每个分类的已花、预测剩余、预测月末总额', en: 'Shows each category’s amount spent, projected remaining, and projected month-end total' },
  'guide.whatif.detailed.grid2_5_label': { zh: '分类明细表', en: 'Category Breakdown Table' },
  'guide.whatif.detailed.grid2_6_desc': { zh: '比如你每天午餐花 RM 15，想试试改成 RM 10 —— 选"设日均值"模式，输入 10，系统就算出月底能省多少', en: 'For instance, if you spend RM 15 on lunch daily and want to try RM 10 — select “Set Daily Average” mode, enter 10, and the system calculates how much you’ll save' },
  'guide.whatif.detailed.grid2_6_label': { zh: '生活化例子', en: 'Real-Life Examples' },
  'guide.whatif.detailed.grid2_7_desc': { zh: '跟随「设置」页的统计范围（本月/近30天），自动适配基线数据', en: 'Follows the Settings page’s statistics range (This Month / Last 30 Days), auto-adapts baseline data' },
  'guide.whatif.detailed.grid2_7_label': { zh: '统计范围适应', en: 'Statistics Range Adaptation' },
  'guide.whatif.detailed.heading1': { zh: '📖 这个页面是干什么的？', en: '📖 What Does This Page Do?' },
  'guide.whatif.detailed.heading2': { zh: '🧩 功能一览', en: '🧩 Features at a Glance' },
  'guide.whatif.detailed.heading3': { zh: '📋 调整模式说明（附例子）', en: '📋 Adjustment Mode Reference (with Examples)' },
  'guide.whatif.detailed.heading4': { zh: '🎯 如何使用', en: '🎯 How to Use' },
  'guide.whatif.detailed.heading5': { zh: '💡 小贴士', en: '💡 Tips' },
  'guide.whatif.detailed.item4_1': { zh: '在页面左侧的分类列表中，找到你想调整的分类（如"餐饮"）', en: 'Find the category you want to adjust in the left sidebar (e.g. “Dining”)' },
  'guide.whatif.detailed.item4_2': { zh: '点击分类行右侧的下拉菜单（默认为"保持趋势"），选择你想要的调整模式', en: 'Click the dropdown on the right side of the category row (defaults to “Keep Trend”) and choose your desired adjustment mode' },
  'guide.whatif.detailed.item4_3': { zh: '如果选了需要填数字的模式（如"设日均值"），旁边会出现输入框，填入金额', en: 'If you picked a mode that requires a number (e.g. “Set Daily Average”), an input field will appear next to it — enter the amount' },
  'guide.whatif.detailed.item4_4': { zh: '可以对多个分类分别调整，也可以使用底部的"全局调整"一次性改动所有分类', en: 'You can adjust multiple categories individually, or use the “Global Adjustment” at the bottom to change all at once' },
  'guide.whatif.detailed.item4_5': { zh: '调整会自动生效——右侧的结果面板会实时显示趋势 vs 调整后的对比', en: 'Adjustments take effect immediately — the results panel on the right shows a real-time comparison of trend vs adjusted scenarios' },
  'guide.whatif.detailed.item4_6': { zh: '想对比具体数字？看右侧的「分类预测明细表」，每个分类的已花、预测剩余、月末总额一目了然', en: 'Want to compare specific numbers? Look at the “Category Forecast Table” on the right — each category’s amount spent, projected remaining, and month-end total are all visible at a glance' },
  'guide.whatif.detailed.row3_0_desc': { zh: '什么都不改，按照现在的消费节奏继续花。<br><em>例子：你现在每天餐饮花 RM 25，继续保持这个水平。</em>', en: 'Don’t change anything — continue spending at the current pace.<br><em>Example: You currently spend RM 25 per day on dining, keep it as is.</em>' },
  'guide.whatif.detailed.row3_0_label': { zh: '保持趋势', en: 'Keep Trend' },
  'guide.whatif.detailed.row3_1_desc': { zh: '设定接下来每天花一个固定金额。<br><em>例子：想每天只花 RM 20 在餐饮上，选这个模式然后输入 20。</em>', en: 'Set a fixed daily amount going forward.<br><em>Example: You want to spend only RM 20 per day on dining — select this mode and enter 20.</em>' },
  'guide.whatif.detailed.row3_1_label': { zh: '设日均值', en: 'Set Daily Average' },
  'guide.whatif.detailed.row3_2_desc': { zh: '这个分类在剩下天数里总共只花这么多钱。<br><em>例子：购物这个月剩 RM 200 的预算，选这个模式输入 200。</em>', en: 'Spend only this much total in the remaining days.<br><em>Example: You have RM 200 left in your shopping budget for the month — select this mode and enter 200.</em>' },
  'guide.whatif.detailed.row3_2_label': { zh: '固定剩余总额', en: 'Fixed Remaining Total' },
  'guide.whatif.detailed.row3_3_desc': { zh: '在现有日均基础上增减一个百分比。<br><em>例子：想砍掉 20% 的交通费，选这个模式输入 −20。</em>', en: 'Increase or decrease your daily average by a percentage.<br><em>Example: Want to cut transport costs by 20% — select this mode and enter −20.</em>' },
  'guide.whatif.detailed.row3_3_label': { zh: '比趋势±%', en: 'vs Trend ±%' },
  'guide.whatif.detailed.row3_4_desc': { zh: '在现有日均基础上每天多花或少花一个固定金额。<br><em>例子：每天少喝一杯 RM 5 的奶茶，选这个模式输入 −5。</em>', en: 'Spend a fixed amount more or less each day compared to current trends.<br><em>Example: Skip one RM 5 milk tea per day — select this mode and enter −5.</em>' },
  'guide.whatif.detailed.row3_4_label': { zh: '比趋势±RM/天', en: 'vs Trend ±RM/Day' },
  'guide.whatif.detailed.row3_5_desc': { zh: '这个分类接下来完全不花钱了。<br><em>例子：决定这个月不买衣服了，选这个模式。</em>', en: 'Stop spending in this category entirely.<br><em>Example: Decide not to buy clothes this month — select this mode.</em>' },
  'guide.whatif.detailed.row3_5_label': { zh: '取消消费', en: 'Cancel Spending' },
  'guide.whatif.detailed.text1': { zh: '「假设分析」是一个模拟工具，让你可以调整未来花钱的方式，看看月底会有什么不同。比如：<strong>"如果接下来每天少喝一杯咖啡，月底能多存多少钱？"</strong>或者<strong>"如果这个月不再点外卖，能省下多少？"</strong>它把抽象的"省钱"变成具体的数字对比。', en: '“What-If Analysis” is a simulation tool that lets you adjust how you spend in the future and see how it affects your month-end balance. For example: <strong>“If I cut out one coffee a day from now on, how much more could I save?”</strong> Or <strong>“If I stop ordering takeout this month, how much would I save?”</strong> It turns abstract “saving money” into concrete numbers.' },
  'guide.whatif.detailed.tip5_1': { zh: '调整后的参数会自动保存，下次打开还在', en: 'Your adjustment parameters are saved automatically and persist when you return' },
  'guide.whatif.detailed.tip5_2': { zh: '"取消消费"一个父分类后，其下所有子分类自动禁用', en: 'After setting a parent category to “Cancel Spending,” all its subcategories are automatically disabled' },
  'guide.whatif.detailed.tip5_3': { zh: '全局调整只影响仍处于"保持趋势"模式的分类', en: 'Global adjustment only affects categories still in “Keep Trend” mode' },
  'guide.whatif.detailed.tip5_4': { zh: '结果面板中的分类明细表可以看到每个分类的详细预测', en: 'The category breakdown table in the results panel shows detailed projections for each category' },
  'guide.whatif.detailed.tip5_5': { zh: '模拟数据范围跟随「设置」页的统计范围（本月/近30天）', en: 'Simulation data range follows the Settings page’s statistics range (This Month / Last 30 Days)' },
  'guide.whatif.simple.heading1': { zh: '📖 模拟"如果…会怎样？"', en: '📖 Simulate “What If…?”' },
  'guide.whatif.simple.heading2': { zh: '🎯 快速上手', en: '🎯 Quick Start' },
  'guide.whatif.simple.item2_1': { zh: '在左侧分类列表中找到想调整的分类（如"餐饮"）', en: 'Find the category you want to adjust in the left sidebar (e.g. “Dining”)' },
  'guide.whatif.simple.item2_2': { zh: '点击右侧下拉菜单（默认"保持趋势"），选择调整模式', en: 'Click the dropdown on the right (defaults to “Keep Trend”) and choose an adjustment mode' },
  'guide.whatif.simple.item2_3': { zh: '如需输入数字（如设日均值 RM 20），旁边的输入框会出现', en: 'If a numeric input is needed (e.g. set daily average to RM 20), an input field appears' },
  'guide.whatif.simple.item2_4': { zh: '右侧结果面板实时显示调整前后的对比', en: 'The results panel on the right shows a real-time comparison between the trend and adjusted scenarios' },
  'guide.whatif.simple.item2_5': { zh: '模拟数据基于「设置」页选择的统计范围（本月/近30天）', en: 'Simulation data is based on the statistics range selected in Settings (This Month / Last 30 Days)' },
  'guide.whatif.simple.text1': { zh: '调整未来花钱方式，看看月底能省多少。比如："如果每天少喝一杯 RM 5 的咖啡，月底能多存多少钱？"', en: 'Adjust how you spend in the future and see how much you could save by month-end. For example: “If I skip one RM 5 coffee every day, how much more could I save by the end of the month?”' },
  'guide.whatif.title': { zh: '🔮 假设分析', en: '🔮 What-If Analysis' },
});
})();
