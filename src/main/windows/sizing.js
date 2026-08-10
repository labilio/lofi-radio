function resizeFixedWindow(window, width, height) {
    const wasResizable = window.isResizable();

    if (!wasResizable) {
        window.setResizable(true);
    }

    window.setSize(width, height);

    if (!wasResizable) {
        window.setResizable(false);
    }
}

module.exports = {
    resizeFixedWindow
};
