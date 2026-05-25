@echo off
chcp 65001 > nul
echo ===============================================
echo   CODEGA AI - llama.dll Sorun Giderme
echo ===============================================
echo.
echo llama.dll veya 0xc000001d hatasinda bu script yol gosterir.
echo.
echo ADIM 1: Visual C++ Redistributable kurun (zorunlu)
echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
echo.
echo ADIM 2: CODEGA AI icindeki Sistem ^> Otomatik Onar butonunu kullanin.
echo.
echo Otomatik Onar, llama-cpp-python paketini AVX kapali olacak sekilde
echo kaynak koddan derler. Hazir CPU wheel kanallari AVX2 gerektirebilir.
echo.
echo ADIM 3: En son AVX'siz Windows paketini indirin:
echo   https://github.com/codegatr/codegaai/releases/latest
echo.
echo ADIM 4: Uygulamayi yeniden baslatin
echo.
pause
