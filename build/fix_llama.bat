@echo off
chcp 65001 > nul
echo ===============================================
echo   CODEGA AI - llama.dll Sorun Giderme
echo ===============================================
echo.
echo llama.dll yuklenemediginde bu script calistirilir.
echo.
echo ADIM 1: Visual C++ Redistributable kurun (zorunlu)
echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
echo.
echo ADIM 2: Asagidaki komutlardan birini Command Prompt'ta calistirin:
echo.
echo   CPU modu (herhangi bir bilgisayarda calisir):
echo   pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
echo.
echo   CUDA 12.2 GPU modu (NVIDIA GPU gerekli):
echo   pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu122
echo.
echo ADIM 3: Uygulamayi yeniden baslatin
echo.
pause
