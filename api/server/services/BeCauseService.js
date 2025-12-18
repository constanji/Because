const path = require('path');
const fs = require('fs').promises;
const { logger } = require('@aipyq/data-schemas');

/**
 * BeCause Service - Handles BeCause command templates and prompt templates
 *
 * 从 LBchat / BeCause 项目迁移而来，用于在 Node.js 后端中访问 BeCauseNode 目录下的
 * command 模板和 prompt 模板，配合 BeCause 工具实现 Text-to-SQL 提示词系统。
 */
class BeCauseService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.becauseNodeDir = path.join(projectRoot, 'BeCauseNode');
    this.commandsDir = path.join(this.becauseNodeDir, 'commands');
    this.templatesDir = path.join(this.becauseNodeDir, 'templates', 'prompt-templates');
  }

  /**
   * 向上查找 BeCauseNode 目录
   */
  async findBeCauseNodeDir(startPath = this.projectRoot) {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const becauseNodePath = path.join(currentPath, 'BeCauseNode');

      try {
        await fs.access(becauseNodePath);
        return becauseNodePath;
      } catch (err) {
        // 继续向上查找
      }

      currentPath = path.dirname(currentPath);
    }

    // 回退到构造函数预设路径
    return this.becauseNodeDir;
  }

  /**
   * 检查 BeCauseNode 是否可用
   */
  async isAvailable() {
    try {
      const becauseNodeDir = await this.findBeCauseNodeDir();
      await fs.access(becauseNodeDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取命令模板文件
   */
  async readCommandTemplate(commandName) {
    const becauseNodeDir = await this.findBeCauseNodeDir();

    // Agentic 命令使用 commands/agentic 子目录
    let commandPath;
    if (commandName.startsWith('agentic/')) {
      const actualCommandName = commandName.replace('agentic/', '');
      commandPath = path.join(becauseNodeDir, 'commands', 'agentic', `${actualCommandName}.md`);
    } else {
      commandPath = path.join(becauseNodeDir, 'commands', `${commandName}.md`);
    }

    try {
      await fs.access(commandPath);
      return await fs.readFile(commandPath, 'utf-8');
    } catch (err) {
      throw new Error(`Command template not found: ${commandName} (path: ${commandPath})`);
    }
  }

  /**
   * 读取 Prompt 模板文件
   */
  async readPromptTemplate(mode = 'default', templateName) {
    const becauseNodeDir = await this.findBeCauseNodeDir();
    const templatePath = path.join(
      becauseNodeDir,
      'templates',
      'prompt-templates',
      mode,
      templateName,
    );

    try {
      await fs.access(templatePath);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (err) {
      throw new Error(`Prompt template not found: ${templatePath} - ${err.message}`);
    }
  }

  /**
   * 列出所有可用命令
   */
  async listCommands() {
    const becauseNodeDir = await this.findBeCauseNodeDir();
    const commandsPath = path.join(becauseNodeDir, 'commands');

    try {
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      const commands = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          commands.push(entry.name.replace('.md', ''));
        } else if (entry.isDirectory() && entry.name === 'agentic') {
          const agenticPath = path.join(commandsPath, 'agentic');
          const agenticEntries = await fs.readdir(agenticPath, { withFileTypes: true });
          for (const agenticEntry of agenticEntries) {
            if (agenticEntry.isFile() && agenticEntry.name.endsWith('.md')) {
              commands.push(`agentic/${agenticEntry.name.replace('.md', '')}`);
            }
          }
        }
      }

      return commands.sort();
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * 从命令模板中解析 frontmatter 信息
   */
  async getCommandInfo(commandName) {
    const content = await this.readCommandTemplate(commandName);

    // 提取 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const info = {};

    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();

        if (key === 'variables') {
          // variables 单独处理
          continue;
        } else if (key === 'version') {
          info[key] = parseFloat(value);
        } else {
          info[key] = value;
        }
      }
    }

    // 提取 variables 列表
    const variablesMatch = frontmatter.match(/variables:\n((?:\s+-\s+.*\n?)+)/);
    if (variablesMatch) {
      const variablesText = variablesMatch[1];
      info.variables = variablesText
        .split('\n')
        .filter((line) => line.trim().startsWith('-'))
        .map((line) => {
          const varMatch = line.match(/-\s+(\w+):\s*(.+)/);
          return varMatch ? { name: varMatch[1], description: varMatch[2] } : null;
        })
        .filter(Boolean);
    }

    return info;
  }

  /**
   * 读取 BeCauseNode 自带的 README
   */
  async readREADME() {
    const becauseNodeDir = await this.findBeCauseNodeDir();
    const readmePath = path.join(becauseNodeDir, 'README.md');

    try {
      return await fs.readFile(readmePath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read README: ${readmePath} - ${err.message}`);
    }
  }
}

module.exports = BeCauseService;


