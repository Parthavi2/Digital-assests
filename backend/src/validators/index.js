const { z } = require('zod');
const { ROLES } = require('../constants/roles');
const { PLATFORMS } = require('../constants/platforms');
const { REVIEW_STATUSES } = require('../constants/statuses');

const emptyBody = z.object({}).passthrough().optional().default({});
const paginationQuery = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  platform: z.string().optional(),
  riskCategory: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional()
}).passthrough().optional().default({});

const idParam = z.object({
  id: z.string().min(1)
});

const assetIdParam = z.object({
  assetId: z.string().min(1)
});

const detectionIdParam = z.object({
  detectionId: z.string().min(1)
});

const crawledMediaIdParam = z.object({
  crawledMediaId: z.string().min(1)
});

const accountIdParam = z.object({
  accountId: z.string().min(1)
});

const authSchemas = {
  register: z.object({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      role: z.nativeEnum(ROLES).optional(),
      organizationName: z.string().min(2).optional(),
      organizationSlug: z.string().min(2).optional()
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  }),
  login: z.object({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(1)
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  })
};

const assetSchemas = {
  update: z.object({
    body: z.object({
      title: z.string().min(2).optional(),
      matchName: z.string().min(2).optional(),
      tournament: z.string().min(2).optional(),
      teams: z.array(z.string()).optional(),
      sportType: z.string().min(2).optional(),
      highlightCategory: z.string().min(2).optional(),
      rightsOwner: z.string().min(2).optional(),
      allowedUsagePolicy: z.record(z.any()).optional(),
      mediaUrl: z.string().url().optional(),
      thumbnailUrl: z.string().url().optional(),
      duration: z.coerce.number().positive().optional(),
      assetFamily: z.string().optional()
    }),
    query: paginationQuery,
    params: idParam
  })
};

const crawlerSchemas = {
  start: z.object({
    body: z.object({
      batchSize: z.coerce.number().int().min(1).max(100).optional(),
      platforms: z.array(z.nativeEnum(PLATFORMS)).optional(),
      query: z.string().optional(),
      runInline: z.boolean().optional()
    }).optional().default({}),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  })
};

const fragmentSchemas = {
  analyze: z.object({
    body: z.object({
      accountId: z.string().optional(),
      windowMinutes: z.coerce.number().int().min(5).max(240).optional()
    }).optional().default({}),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  })
};

const mutationSchemas = {
  buildTree: z.object({
    body: z.object({
      assetId: z.string().min(1)
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  })
};

const reviewSchemas = {
  status: z.object({
    body: z.object({
      status: z.nativeEnum(REVIEW_STATUSES),
      decisionSummary: z.string().optional()
    }),
    query: paginationQuery,
    params: idParam
  }),
  comment: z.object({
    body: z.object({
      comment: z.string().min(2)
    }),
    query: paginationQuery,
    params: idParam
  }),
  assign: z.object({
    body: z.object({
      assignedToId: z.string().min(1)
    }),
    query: paginationQuery,
    params: idParam
  })
};

const settingsSchemas = {
  profile: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      profile: z.record(z.any()).optional()
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  }),
  organization: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      domain: z.string().optional(),
      rightsTerritories: z.any().optional(),
      securitySettings: z.record(z.any()).optional(),
      notificationPreferences: z.record(z.any()).optional()
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  }),
  notifications: z.object({
    body: z.object({
      emailAlerts: z.boolean().optional(),
      criticalRiskAlerts: z.boolean().optional(),
      dailyDigest: z.boolean().optional(),
      webhookUrl: z.string().url().optional()
    }),
    query: paginationQuery,
    params: z.object({}).optional().default({})
  })
};

const paramsSchemas = {
  id: z.object({ body: emptyBody, query: paginationQuery, params: idParam }),
  assetId: z.object({ body: emptyBody, query: paginationQuery, params: assetIdParam }),
  detectionId: z.object({ body: emptyBody, query: paginationQuery, params: detectionIdParam }),
  crawledMediaId: z.object({ body: emptyBody, query: paginationQuery, params: crawledMediaIdParam }),
  accountId: z.object({ body: emptyBody, query: paginationQuery, params: accountIdParam }),
  list: z.object({ body: emptyBody, query: paginationQuery, params: z.object({}).optional().default({}) })
};

module.exports = {
  authSchemas,
  assetSchemas,
  crawlerSchemas,
  fragmentSchemas,
  mutationSchemas,
  reviewSchemas,
  settingsSchemas,
  paramsSchemas
};
