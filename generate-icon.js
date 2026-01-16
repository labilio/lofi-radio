// 生成应用图标的脚本
const fs = require('fs');
const path = require('path');

// 创建一个简单的SVG图标（音乐符号）
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <!-- 背景圆形 -->
  <circle cx="128" cy="128" r="120" fill="#6366f1" stroke="#4f46e5" stroke-width="4"/>
  
  <!-- 音乐符号 -->
  <g transform="translate(128, 128)">
    <!-- 音符主体 -->
    <ellipse cx="0" cy="-20" rx="25" ry="35" fill="white" opacity="0.9"/>
    <!-- 音符杆 -->
    <rect x="20" y="-50" width="8" height="80" fill="white" opacity="0.9"/>
    <!-- 音符装饰 -->
    <path d="M 28 -50 Q 40 -45 45 -35 Q 50 -25 45 -15" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.9"/>
  </g>
  
  <!-- 小音符装饰 -->
  <circle cx="80" cy="100" r="8" fill="white" opacity="0.6"/>
  <circle cx="180" cy="150" r="6" fill="white" opacity="0.6"/>
</svg>`;

// 保存SVG文件
const svgPath = path.join(__dirname, 'icon.svg');
fs.writeFileSync(svgPath, svgIcon);
console.log('✅ SVG图标已创建: icon.svg');

// 创建说明文件
const readmeIcon = `
## 图标文件说明

已生成 SVG 图标文件：icon.svg

### 转换为 ICO 文件（用于Windows）

1. **在线转换**（推荐）：
   - 访问 https://convertio.co/zh/svg-ico/
   - 上传 icon.svg
   - 下载 icon.ico

2. **使用 ImageMagick**（如果已安装）：
   \`\`\`bash
   magick convert icon.svg -resize 256x256 icon.ico
   \`\`\`

3. **使用在线工具**：
   - https://www.icoconverter.com/
   - https://convertio.co/zh/svg-ico/

### 图标规格

- 主图标：256x256 像素
- 颜色：靛蓝色背景 (#6366f1) + 白色音乐符号
- 格式：SVG（矢量，可缩放）

转换后的 icon.ico 文件将自动被应用使用。
`;

fs.writeFileSync(path.join(__dirname, 'ICON_README.md'), readmeIcon);
console.log('✅ 图标说明文件已创建: ICON_README.md');
console.log('\n📝 下一步：请将 icon.svg 转换为 icon.ico 文件');
console.log('   可以使用在线工具：https://convertio.co/zh/svg-ico/');