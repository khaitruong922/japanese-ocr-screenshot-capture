var jcrop, selection;

var overlay = ((active) => (state) => {
  active =
    typeof state === "boolean" ? state : state === null ? active : !active;
  $(".jcrop-holder")[active ? "show" : "hide"]();
  chrome.runtime.sendMessage({ message: "active", active });
})(false);

var image = (done) => {
  var image = new Image();
  image.id = "fake-image";
  image.src = chrome.runtime.getURL("/content/pixel.png");
  image.onload = () => {
    $("body").append(image);
    done();
  };
};

var init = (done) => {
  $("#fake-image").Jcrop(
    {
      bgColor: "none",
      onSelect: (e) => {
        selection = e;
        capture();
      },
      onChange: (e) => {
        selection = e;
      },
      onRelease: (e) => {
        setTimeout(() => {
          selection = null;
        }, 1000);
      },
    },
    function ready() {
      jcrop = this;

      $(".jcrop-hline, .jcrop-vline").css({
        backgroundImage: `url(${chrome.runtime.getURL("/vendor/Jcrop.gif")})`,
      });

      if (selection) {
        jcrop.setSelect([selection.x, selection.y, selection.x2, selection.y2]);
      }

      done && done();
    }
  );
};

var capture = (force) => {
  chrome.storage.sync.get((config) => {
    if (
      selection &&
      (config.method === "crop" || (config.method === "wait" && force))
    ) {
      jcrop.release();
      setTimeout(() => {
        var _selection = selection;
        chrome.runtime.sendMessage(
          {
            message: "capture",
            format: config.format,
            quality: config.quality,
          },
          (res) => {
            overlay(false);
            crop(
              res.image,
              _selection,
              devicePixelRatio,
              config.scaling,
              config.format,
              async (image) => {
                await save(
                  image,
                  config.format,
                  config.save,
                  config.clipboard,
                  config.dialog,
                  selection
                );
                selection = null;
              }
            );
          }
        );
      }, 50);
    } else if (config.method === "view") {
      chrome.runtime.sendMessage(
        {
          message: "capture",
          format: config.format,
          quality: config.quality,
        },
        (res) => {
          overlay(false);
          if (devicePixelRatio !== 1 && !config.scaling) {
            var area = { x: 0, y: 0, w: innerWidth, h: innerHeight };
            crop(
              res.image,
              area,
              devicePixelRatio,
              config.scaling,
              config.format,
              (image) => {
                save(
                  image,
                  config.format,
                  config.save,
                  config.clipboard,
                  config.dialog
                );
              }
            );
          } else {
            save(
              res.image,
              config.format,
              config.save,
              config.clipboard,
              config.dialog
            );
          }
        }
      );
    } else if (config.method === "page") {
      var container = ((html = document.querySelector("html")) => (
        (html.scrollTop = 1),
        html.scrollTop
          ? ((html.scrollTop = 0), html)
          : document.querySelector("body")
      ))();
      container.scrollTop = 0;
      document.querySelector("html").style.overflow = "hidden";
      document.querySelector("body").style.overflow = "hidden";
      setTimeout(() => {
        var images = [];
        var count = 0;
        (function scroll(done) {
          chrome.runtime.sendMessage(
            {
              message: "capture",
              format: config.format,
              quality: config.quality,
            },
            (res) => {
              var height = innerHeight;
              if (count * innerHeight > container.scrollTop) {
                height = container.scrollTop - (count - 1) * innerHeight;
              }
              images.push({
                height,
                offset: container.scrollTop,
                image: res.image,
              });

              if (
                (count * innerHeight === container.scrollTop &&
                  (count - 1) * innerHeight === container.scrollTop) ||
                count * innerHeight > container.scrollTop
              ) {
                done();
                return;
              }

              count += 1;
              container.scrollTop = count * innerHeight;
              setTimeout(() => {
                if (count * innerHeight !== container.scrollTop) {
                  container.scrollTop = count * innerHeight;
                }
                scroll(done);
              }, config.delay);
            }
          );
        })(() => {
          overlay(false);
          var area = {
            x: 0,
            y: 0,
            w: innerWidth,
            h: images.reduce((all, { height }) => (all += height), 0),
          };
          crop(
            images,
            area,
            devicePixelRatio,
            config.scaling,
            config.format,
            (image) => {
              document.querySelector("html").style.overflow = "";
              document.querySelector("body").style.overflow = "";
              save(
                image,
                config.format,
                config.save,
                config.clipboard,
                config.dialog
              );
            }
          );
        });
      }, config.delay);
    }
  });
};

var filename = (format) => {
  var pad = (n) => ((n = n + ""), n.length >= 2 ? n : `0${n}`);
  var ext = (format) =>
    format === "jpeg" ? "jpg" : format === "png" ? "png" : "png";
  var timestamp = (now) =>
    [pad(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate())].join(
      "-"
    ) +
    " - " +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(
      "-"
    );
  return `Screenshot Capture - ${timestamp(new Date())}.${ext(format)}`;
};

const addPopup = (selection, text) => {
  const popup = document.createElement("div");
  popup.style.position = "absolute";
  const scrollTop =
    document.documentElement.scrollTop || document.body.scrollTop;
  const scrollLeft =
    document.documentElement.scrollLeft || document.body.scrollLeft;
  popup.style.top = selection.y + scrollTop - 5 + "px";
  popup.style.left = selection.x + scrollLeft - 5 + "px";
  popup.style.width = selection.w + "px";
  popup.style.height = selection.h + "px";
  popup.style.backgroundColor = "white";
  popup.style.zIndex = "10000";
  popup.style.display = "flex";
  popup.style.alignItems = "center";
  popup.style.justifyContent = "center";
  popup.style.fontSize = "16px";
  popup.style.overflow = "auto";
  popup.style.color = "black";
  popup.style.fontFamily = `ヒラギノ角ゴ Pro W3","Hiragino Kaku Gothic Pro","メイリオ",Meiryo,"ＭＳ Ｐゴシック",sans-serif`;
  popup.style.padding = "5px";
  popup.style.boxShadow = "0 0 5px rgba(0,0,0,0.5)";
  popup.innerHTML = text;
  // Add close button
  const closeButton = document.createElement("div");
  closeButton.innerHTML = "✖"; // Unicode character for 'multiplication x'
  closeButton.style.position = "absolute";
  closeButton.style.top = selection.y + scrollTop - 10 + "px";
  closeButton.style.left = selection.x2 + scrollLeft - 5 + "px";
  closeButton.style.display = "flex";
  closeButton.style.alignItems = "center";
  closeButton.style.justifyContent = "center";
  closeButton.style.width = "20px";
  closeButton.style.height = "20px";
  closeButton.style.cursor = "pointer";
  closeButton.style.border = "none";
  closeButton.style.background = "#f598d3";
  closeButton.style.fontSize = "1em";
  closeButton.style.color = "black";
  closeButton.style.borderRadius = "50%";
  closeButton.style.zIndex = "10001";
  closeButton.onclick = () => {
    document.body.removeChild(popup);
    document.body.removeChild(closeButton);
  };
  document.body.appendChild(popup);
  document.body.appendChild(closeButton);
};

var save = async (image, format, save, clipboard, dialog, selection) => {
  if (save.includes("file")) {
    const formData = new FormData();
    const blob = await fetch(image).then((r) => r.blob());
    formData.append("uploadedImages", blob, "screenshot.png");

    try {
      const res = await fetch("https://www.manabu.sg/api/v1/contents/ocr", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      let text = data.ocrContents[0]?.[0]?.[0]?.description || "";
      text = text.replace(/\s/g, "");
      addPopup(selection, text);
    } catch (e) {
      console.error(e);
    }
  }
  if (save.includes("clipboard")) {
    if (clipboard === "url") {
      navigator.clipboard.writeText(image).then(() => {
        if (dialog) {
          alert(
            [
              "Screenshot Capture:",
              "Data URL String",
              "Saved to Clipboard!",
            ].join("\n")
          );
        }
      });
    } else if (clipboard === "binary") {
      var [header, base64] = image.split(",");
      var [_, type] = /data:(.*);base64/.exec(header);
      var binary = atob(base64);
      var array = Array.from({ length: binary.length }).map((_, index) =>
        binary.charCodeAt(index)
      );
      navigator.clipboard
        .write([
          new ClipboardItem({
            // jpeg is not supported on write, though the encoding is preserved
            "image/png": new Blob([new Uint8Array(array)], {
              type: "image/png",
            }),
          }),
        ])
        .then(() => {
          if (dialog) {
            alert(
              [
                "Screenshot Capture:",
                "Binary Image",
                "Saved to Clipboard!",
              ].join("\n")
            );
          }
        });
    }
  }
};

window.addEventListener(
  "resize",
  ((timeout) => () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      jcrop.destroy();
      init(() => overlay(null));
    }, 100);
  })()
);

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.message === "init") {
    res({}); // prevent re-injecting

    if (!jcrop) {
      image(() =>
        init(() => {
          overlay();
          capture();
        })
      );
    } else {
      overlay();
      capture(true);
    }
  }
  return true;
});
