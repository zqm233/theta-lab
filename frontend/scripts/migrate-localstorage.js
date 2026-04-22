/**
 * 清理旧版本的 localStorage 数据
 * 在浏览器控制台运行此脚本
 */

console.log('🧹 开始清理旧版本的 localStorage 数据...');

const keysToMigrate = [
  'lang',
  'portfolio', 
  'thetalab-settings',
  'thetalab-exp-TSLL',
  'thetalab-exp-TSLA'
];

let cleaned = 0;
let migrated = 0;

for (const key of keysToMigrate) {
  const raw = localStorage.getItem(key);
  if (!raw) continue;
  
  try {
    const value = JSON.parse(raw);
    
    // 检查是否已经是新格式
    if (typeof value === 'object' && value !== null && 'version' in value && 'data' in value) {
      console.log(`✅ ${key}: 已经是新格式,跳过`);
      continue;
    }
    
    // 迁移到新格式
    const wrapper = {
      version: 1,
      data: value,
      timestamp: Date.now()
    };
    
    localStorage.setItem(key, JSON.stringify(wrapper));
    migrated++;
    console.log(`🔄 ${key}: 已迁移到新格式`);
  } catch (err) {
    // 如果解析失败,删除该项
    localStorage.removeItem(key);
    cleaned++;
    console.log(`🗑️  ${key}: 已删除(无效数据)`);
  }
}

console.log(`\n✅ 清理完成!`);
console.log(`   迁移: ${migrated} 项`);
console.log(`   删除: ${cleaned} 项`);
console.log(`\n请刷新页面!`);
