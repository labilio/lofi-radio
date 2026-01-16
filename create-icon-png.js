// 创建一个简单的PNG图标（使用canvas，如果可用）
const fs = require('fs');
const path = require('path');

// 尝试使用canvas库，如果不可用则创建一个简单的说明
try {
  // 检查是否有canvas库
  const canvas = require('canvas');
  const { createCanvas } = canvas;

  // 创建不同尺寸的图标
  const sizes = [16, 32, 48, 64, 128, 256];
  
  sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 绘制背景圆形
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // 绘制边框
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制音乐符号（简化版）
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', size / 2, size / 2);

    // 保存为PNG
    const buffer = canvas.toBuffer('image/png');
    const filename = `icon-${size}.png`;
    fs.writeFileSync(path.join(__dirname, filename), buffer);
    console.log(`✅ 已创建: ${filename}`);
  });

  console.log('\n✅ 所有PNG图标已创建！');
} catch (e) {
  console.log('⚠️  canvas库未安装，跳过PNG生成');
  console.log('   你可以使用在线工具将 icon.svg 转换为 icon.ico');
  console.log('   推荐工具: https://convertio.co/zh/svg-ico/');
}