from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "codegaai" / "ui" / "web" / "index.html"
THEME = ROOT / "codegaai" / "ui" / "web" / "css" / "claude_theme.css"
VIEWS = ROOT / "codegaai" / "ui" / "web" / "js" / "views.js"
INIT = ROOT / "codegaai" / "__init__.py"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def sidebar_primary_nav(html: str) -> str:
    start = html.index('sidebar__nav sidebar__nav--primary')
    end = html.index('</nav>', start)
    return html[start:end]


def test_codex_style_menu_bar_exists():
    html = read(INDEX)
    assert 'class="app-menubar"' in html
    for label in ["Dosya", "Düzenle", "Görüntüle", "Pencere", "Yardım"]:
        assert f">{label}<" in html


def test_sidebar_is_reduced_to_core_destinations():
    primary = sidebar_primary_nav(read(INDEX))
    for destination in [
        'data-view="chat"',
        'data-view="search"',
        'data-view="tools"',
        'data-view="calendar"',
        'data-view="projects"',
    ]:
        assert destination in primary

    for crowded_destination in [
        'data-view="image"',
        'data-view="video"',
        'data-view="federation"',
        'data-view="system"',
        'data-view="memory"',
        'data-view="autolearn"',
    ]:
        assert crowded_destination not in primary


def test_advanced_tools_remain_reachable_from_command_center():
    html = read(INDEX)
    assert 'data-view="tools"' in html
    for tool in [
        "image",
        "vision",
        "video",
        "audio",
        "memory",
        "autolearn",
        "weblearn",
        "federation",
        "calendar",
        "canvas",
        "translate",
        "system",
        "devtools-ui",
    ]:
        assert f'data-command-view="{tool}"' in html


def test_menu_buttons_are_wired_to_view_switcher():
    js = read(VIEWS)
    assert 'button[data-view]' in js
    assert '".sidebar .nav-item"' in js
    assert "sidebarGroups" in js
    assert 'image: "tools"' in js
    assert "activate(btn.dataset.view)" in js


def test_shell_css_supports_menu_and_command_center():
    css = read(THEME)
    for selector in [".app-menubar", ".app-menu-item", ".command-shell", ".command-grid", ".command-card"]:
        assert selector in css


def test_settings_view_keeps_full_readable_content():
    css = read(THEME)
    assert '.view[data-view="settings"].active' in css
    assert "display: block" in css
    assert ".view[data-view=\"settings\"] .settings-group" in css
    assert "overflow: visible" in css


def test_chat_toolbar_uses_readable_tool_chips():
    html = read(INDEX)
    assert 'class="chat-toolbar"' in html
    assert 'class="tool-chip toolbar-nav"' in html
    for label in ["Görsel", "Canvas", "Ses", "Ekran", "Çeviri", "Bellek", "Öğrenme"]:
        assert f"<span>{label}</span>" in html


def test_version_marks_codex_shell_release():
    init = read(INIT)
    assert '__version__ = "4.5.6"' in init
    assert "Action-First Delivery Guard" in init
