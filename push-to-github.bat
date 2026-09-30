@echo off
echo ========================================================
echo   PUSHING TO GITHUB (pratikrise25-code/public-infrastructure-system)
echo ========================================================
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo SUCCESS! Repository pushed to GitHub!
    echo.
    echo Next step: Deploy on Render for 24/7 Permanent Free Hosting:
    echo 1. Go to https://dashboard.render.com
    echo 2. Click 'New +' -> 'Web Service'
    echo 3. Select 'pratikrise25-code/public-infrastructure-system'
    echo 4. Click 'Deploy Web Service'
    echo ========================================================
) else (
    echo.
    echo [NOTE] If you got an error, please ensure you created the empty repository
    echo at: https://github.com/new?name=public-infrastructure-system
    echo and authorized Git Credential Manager.
)
pause
