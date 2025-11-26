let ws;
let currentSermon = null;
let slides = [];
let selectedSlideIndex = null;

/* ======================
   WEBSOCKET
====================== */
function connectWS() {
    ws = new WebSocket(`ws://${location.hostname}:3000`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: "hello",
            role: "panel",
            room: "default"
        }));
    };
}

connectWS();

/* ======================
   ELEMENTOS
====================== */
const slidesList = document.getElementById("slidesList");
const addSlideBtn = document.getElementById("addSlideBtn");
const saveSermonBtn = document.getElementById("saveSermonBtn");
const titleInput = document.getElementById("sermonTitle");
const dateInput = document.getElementById("sermonDate");

/* ======================
   CRIAR SLIDE
====================== */
addSlideBtn.onclick = () => {
    const newSlide = {
        id: "slide_" + Math.random().toString(36).substr(2, 9),
        type: "topico",
        content: {
            texto: "",
            corTexto: "#ffffff",
            corFundo: "#000000",
            imagem: null
        }
    };

    slides.push(newSlide);
    renderSlides();
};

/* ======================
   RENDERIZAR LISTA
====================== */
function renderSlides() {
    slidesList.innerHTML = "";

    slides.forEach((slide, index) => {
        const box = document.createElement("div");
        box.className = "slideBox";
        box.style.background = slide.content.imagem
            ? `url('${slide.content.imagem}') center/cover no-repeat`
            : slide.content.corFundo;

        box.innerHTML = `
            <textarea class="slideText">${slide.content.texto}</textarea>

            <div class="slideTools">
                <label>Cor texto:<br><input type="color" class="corTexto" value="${slide.content.corTexto}"></label>
                <label>Cor fundo:<br><input type="color" class="corFundo" value="${slide.content.corFundo}"></label>
                <label>Imagem fundo:<br><input type="file" class="imgBg"></label>

                <button class="btnSend">Enviar</button>
                <button class="btnDel">Excluir</button>
            </div>
        `;

        // editar texto
        box.querySelector(".slideText").oninput = (ev) => {
            slide.content.texto = ev.target.value;
        };

        // cor texto
        box.querySelector(".corTexto").oninput = (ev) => {
            slide.content.corTexto = ev.target.value;
            renderSlides();
        };

        // cor fundo
        box.querySelector(".corFundo").oninput = (ev) => {
            slide.content.corFundo = ev.target.value;
            slide.content.imagem = null;
            renderSlides();
        };

        // imagem fundo
        box.querySelector(".imgBg").onchange = (ev) => {
            const file = ev.target.files[0];
            const reader = new FileReader();
            reader.onload = () => {
                slide.content.imagem = reader.result;
                renderSlides();
            };
            reader.readAsDataURL(file);
        };

        // enviar para telão
        box.querySelector(".btnSend").onclick = () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "goto",
                    room: "default",
                    slide
                }));
            }
        };

        // excluir
        box.querySelector(".btnDel").onclick = () => {
            slides.splice(index, 1);
            renderSlides();
        };

        slidesList.appendChild(box);
    });
}

/* ======================
   SALVAR SERMÃO
====================== */
saveSermonBtn.onclick = async () => {
    const title = titleInput.value.trim();
    if (title === "") {
        alert("Digite um título!");
        return;
    }

    const sermon = {
        title,
        date: dateInput.value,
        slides
    };

    const res = await fetch("/api/sermons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sermon)
    });

    const data = await res.json();

    if (data.id) alert("Sermão salvo com sucesso!");
    else alert("Erro ao salvar sermon...");
};

/* ======================
   ESTILOS (gerados pelo JS)
====================== */
const style = document.createElement("style");
style.innerHTML = `
.slideBox {
    padding: 15px;
    border: 2px solid #444;
    border-radius: 10px;
    margin-bottom: 20px;
    background-size: cover;
    background-position: center;
    color: white;
}

.slideText {
    width: 100%;
    height: 100px;
    font-size: 18px;
    padding: 8px;
}

.slideTools {
    margin-top: 10px;
}

.slideTools input[type=color] {
    width: 60px;
    height: 40px;
}

.slideTools button {
    padding: 8px 12px;
    margin-top: 8px;
    margin-right: 10px;
}
`;
document.body.appendChild(style);