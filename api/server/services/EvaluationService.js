const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class EvaluationService {
  /**
   * BIRD mini_dev EX/R-VES 在 dev_databases/*.sqlite 上执行，与生成时选的方言无关。
   * 若用 MySQL/PostgreSQL 连接本地库，通常无对应库或执行失败，EX 会恒为 0。
   */
  static getExecutionSqlDialect(_sqlDialect) {
    return 'SQLite';
  }

  static async evaluate(benchmarkRoot, predictionsPath, datasetId, sqlDialect, metrics = ['EX'], onProgress = null) {
    const results = {};
    for (const metric of metrics) {
      try {
        const metricResult = await this.runEvaluationMetric(
          benchmarkRoot,
          metric,
          predictionsPath,
          datasetId,
          sqlDialect,
          onProgress,
        );
        results[metric] = metricResult;
      } catch (error) {
        console.error(`Error evaluating metric ${metric}:`, error);
        results[metric] = { error: error.message };
      }
    }
    return results;
  }

  static runEvaluationMetric(benchmarkRoot, metric, predictionsPath, datasetId, sqlDialect, onProgress) {
    return new Promise((resolve, reject) => {
      const scriptMap = {
        EX: 'evaluation_ex.py',
        'R-VES': 'evaluation_ves.py',
        'Soft F1': 'evaluation_f1.py',
      };
      const scriptName = scriptMap[metric];
      if (!scriptName) return reject(new Error(`Unknown metric: ${metric}`));

      const root = benchmarkRoot || path.join(__dirname, '../../benchmark');
      const scriptPath = path.join(root, 'evaluation', scriptName);
      const dbRootPath = path.join(root, 'data', 'dev_databases') + path.sep;
      const evaluationDir = path.join(root, 'evaluation');
      const groundTruthPath = predictionsPath.groundTruth;
      const diffJsonPath = predictionsPath.diffJsonl || path.join(path.dirname(predictionsPath.predictions), `${path.basename(predictionsPath.predictions, '_predictions.json')}_diff.jsonl`);

      const executionMetrics = new Set(['EX', 'R-VES']);
      const executionSqlDialect = executionMetrics.has(metric)
        ? this.getExecutionSqlDialect(sqlDialect)
        : sqlDialect;
      if (executionMetrics.has(metric) && executionSqlDialect !== sqlDialect) {
        console.warn(
          `[EvaluationService] ${metric} 在 dev_databases/*.sqlite 上执行，使用 ${executionSqlDialect}（生成方言为 ${sqlDialect}）`,
        );
      }

      fs.access(scriptPath)
        .then(() => {
          const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
          const pythonProcess = spawn(
            pythonCmd,
            [
              scriptPath,
              '--predicted_sql_path',
              predictionsPath.predictions,
              '--ground_truth_path',
              groundTruthPath,
              '--db_root_path',
              dbRootPath,
              '--sql_dialect',
              executionSqlDialect,
              '--diff_json_path',
              diffJsonPath,
              '--num_cpus',
              '4',
              '--meta_time_out',
              '30.0',
            ],
            {
              cwd: evaluationDir,
              env: { ...process.env, PYTHONPATH: evaluationDir },
            },
          );

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            if (onProgress) onProgress(50);
          });
          pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          pythonProcess.on('close', (code) => {
            if (code !== 0) {
              console.error(`[EvaluationService] ${metric} script exited ${code}. stderr:`, stderr);
              return reject(new Error(`Evaluation script failed with code ${code}: ${stderr}`));
            }
            try {
              resolve(this.parseEvaluationOutput(stdout, metric));
            } catch (error) {
              console.error(`[EvaluationService] Failed to parse ${metric} output. stdout:`, stdout.slice(0, 500));
              reject(new Error(`Failed to parse evaluation output: ${error.message}`));
            }
          });
        })
        .catch((err) => {
          console.warn(`[EvaluationService] Python script not available or error for ${metric}:`, err?.message || err);
          this.runNodeJSEvaluation(metric, predictionsPath, datasetId, sqlDialect).then(resolve).catch(reject);
        });
    });
  }

  static async runNodeJSEvaluation(metric, predictionsPath, datasetId, sqlDialect) {
    return {
      metric,
      note: 'Node.js fallback evaluation (simplified)',
      accuracy: 0,
      simple: 0,
      moderate: 0,
      challenging: 0,
      total: 0,
    };
  }

  static parseEvaluationOutput(output, metric) {
    const lines = output.split('\n');
    const result = {
      metric,
      accuracy: 0,
      simple: 0,
      moderate: 0,
      challenging: 0,
      total: 0,
    };

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.includes('simple') &&
        line.includes('moderate') &&
        line.includes('challenging') &&
        line.includes('total')
      ) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex >= 0) {
      const countLine = lines[headerIndex + 1]?.trim() || '';
      if (countLine.toLowerCase().startsWith('count')) {
        const countParts = countLine.split(/\s+/).filter((p) => p.length > 0);
        const countNumbers = countParts
          .slice(1)
          .map((p) => parseInt(p, 10))
          .filter((n) => !Number.isNaN(n));
        if (countNumbers.length >= 4) {
          result.total = countNumbers[3];
        }
      }

      for (let i = headerIndex + 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('===') || line.length === 0) continue;

        const metricVariants = [metric === 'Soft F1' ? 'Soft-F1' : metric, metric].filter(Boolean);
        for (const metricName of metricVariants) {
          const metricPattern = new RegExp(`^${metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`);
          if (line.match(metricPattern)) {
            const regex = new RegExp(
              `${metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+\\.?\\d*)\\s+(\\d+\\.?\\d*)\\s+(\\d+\\.?\\d*)\\s+(\\d+\\.?\\d*)`,
            );
            const match = line.match(regex);
            if (match) {
              result.simple = parseFloat(match[1]) || 0;
              result.moderate = parseFloat(match[2]) || 0;
              result.challenging = parseFloat(match[3]) || 0;
              result.accuracy = parseFloat(match[4]) || 0;
              return result;
            }
            const parts = line.split(/\s+/).filter((p) => p.length > 0);
            const metricIndex = parts.findIndex((p) => p === metricName || p.startsWith(metricName));
            if (metricIndex >= 0) {
              const numbers = parts
                .slice(metricIndex + 1)
                .map((p) => parseFloat(p))
                .filter((n) => !Number.isNaN(n));
              if (numbers.length >= 4) {
                result.simple = numbers[0] || 0;
                result.moderate = numbers[1] || 0;
                result.challenging = numbers[2] || 0;
                result.accuracy = numbers[3] || 0;
                return result;
              }
            }
          }
        }
      }
    }

    const totalMatch = output.match(/total[:\s]+(\d+\.?\d*)/i);
    if (totalMatch) result.accuracy = parseFloat(totalMatch[1]);
    return result;
  }
}

module.exports = EvaluationService;
