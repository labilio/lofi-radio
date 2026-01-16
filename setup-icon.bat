@echo off
echo ========================================
echo    Lofi Radio - 图标设置助手
echo ========================================
echo.

REM 检查是否存在 icon.ico
if exist "icon.ico" (
    echo [OK] 找到 icon.ico 文件
    echo.
    echo 图标已准备就绪！
    echo 应用启动时会自动使用此图标。
    echo.
    goto :end
)

REM 检查是否存在 icon.svg
if exist "icon.svg" (
    echo [INFO] 找到 icon.svg 文件，但需要转换为 .ico 格式
    echo.
    echo 请按以下步骤操作：
    echo.
    echo 1. 访问在线转换工具：
    echo    https://convertio.co/zh/svg-ico/
    echo.
    echo 2. 上传 icon.svg 文件
    echo.
    echo 3. 下载转换后的 icon.ico 文件
    echo.
    echo 4. 将 icon.ico 放到项目根目录
    echo.
    echo 5. 重新运行此脚本验证
    echo.
    goto :end
)

REM 如果都没有，生成SVG图标
echo [WARN] 未找到图标文件
echo.
echo 正在生成 SVG 图标...
node generate-icon.js
echo.
echo 请按照上面的说明将 icon.svg 转换为 icon.ico
echo.

:end
echo.
echo 按任意键退出...
pause >nul