// LOMBARDO — Web
const phone = "5493412762319"; // tu número (sin +)

const messages = {
  general: "Hola! Quiero hacer una reserva en Lombardo. ¿Me pasás disponibilidad?",
  eventos: "Hola! Quiero consultar por experiencias / catas en Lombardo. ¿Me cuentan opciones?",
  empresas: "Hola! Soy de una empresa en la zona y me interesa armar una alianza con Lombardo. ¿Podemos coordinar?"
};

function waLink(key){
  const msg = messages[key] || messages.general;
  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
}

document.querySelectorAll("[data-wa]").forEach(el=>{
  const key = el.getAttribute("data-wa");
  el.setAttribute("href", waLink(key));
  el.setAttribute("target","_blank");
  el.setAttribute("rel","noreferrer");
});

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
