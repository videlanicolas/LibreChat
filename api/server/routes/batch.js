const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { checkBatchStatusHandler } = require('~/server/controllers/BatchController');

const router = express.Router();

router.post('/status', requireJwtAuth, checkBatchStatusHandler);

module.exports = router;
