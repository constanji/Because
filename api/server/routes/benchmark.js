const express = require('express');
const router = express.Router();
const BenchmarkController = require('../controllers/BenchmarkController');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const checkAdmin = require('../middleware/roles/admin');

router.use(requireJwtAuth);
router.use(checkAdmin);

// BIRD 基准测试
router.post('/run', BenchmarkController.runBenchmark);
router.get('/task/:taskId', BenchmarkController.getTaskStatus);
router.post('/task/:taskId/cancel', BenchmarkController.cancelTask);
router.get('/result/:taskId', BenchmarkController.getResult);
router.get('/sql-comparison/:taskId', BenchmarkController.getSQLComparison);
router.get('/tasks', BenchmarkController.listTasks);

// 自定义数据源基准测试
router.post('/upload-dataset', BenchmarkController.uploadDataset);
router.get('/template', BenchmarkController.downloadTemplate);
router.post('/run-custom', BenchmarkController.runCustomBenchmark);

module.exports = router;
