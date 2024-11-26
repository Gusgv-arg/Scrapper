import dotenv from "dotenv";
import puppeteer from "puppeteer";
import { urlsMercadoLibre } from "./urlsMercadoLibre.js";

dotenv.config();

let isScraping = false; // Variable de bloqueo

export const scrapperMercadoLibre = async () => {
	console.log("isScraping:", isScraping)
	if (isScraping === true) {
		console.log("El scraping ya está en ejecución. Ignorando la nueva solicitud.");
		return; 
	}
	isScraping = true; // Establecer el bloqueo
		
	// Inicializa el navegador
	//const browser = await puppeteer.launch({ headless: false }); // Cambié headless a false para depurar visualmente
	const browser = await puppeteer.launch({
		args: [
			"--disable-setuid-sandbox",
			"--no-sandbox",
			"--single-process",
			"--no-zygote",
		],
		executablePath:
			process.env.NODE_ENV === "production"
				? process.env.PUPPETEER_EXECUTABLE_PATH
				: puppeteer.executablePath(),
	});
	const page = await browser.newPage();

	let allProducts = [];

	try {
		for (const url of urlsMercadoLibre) {
			console.log(`Navegando a la URL: ${url}`);
			await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

			// Ingresa en la barra de búsqueda
			/* console.log("Ingresando la búsqueda");
			await page.type('input[name="as_word"]', "blitz 110");
			await page.click('button[type="submit"]'); */

			// Espera a que los resultados se carguen
			console.log(
				"Esperando a que los resultados de la búsqueda se carguen..."
			);
			await page.waitForSelector("ol.ui-search-layout", { timeout: 15000 });

			// Verifica si los resultados están presentes
			const resultadosDisponibles = await page.$("ol.ui-search-layout");
			if (resultadosDisponibles) {
				console.log(
					"Resultados de búsqueda encontrados, procediendo al scraping..."
				);
			} else {
				console.error(
					"No se encontró el contenedor de resultados. Verifique el selector o la conexión."
				);
				continue; // Salta a la siguiente URL
			}

			do {
				// Realiza el scraping de cada aviso
				const products = await page.evaluate(() => {
					// Selecciona todos los contenedores de resultados dentro del elemento <ol>
					const resultados = document.querySelectorAll(
						"ol.ui-search-layout.ui-search-layout--grid > li.ui-search-layout__item"
					);
					let data = [];

					// Itera sobre los resultados para extraer la información relevante
					resultados.forEach((resultado) => {
						const titulo =
							resultado.querySelector("h2.poly-component__title > a")
								?.innerText || "Título no disponible";
						const precio =
							resultado.querySelector(
								".poly-component__price .andes-money-amount__fraction"
							)?.innerText || "Precio no disponible";
						const link =
							resultado.querySelector("h2.poly-component__title > a")?.href ||
							"Link no disponible";
						const ubicacion =
							resultado.querySelector(".poly-component__location")?.innerText ||
							"Ubicación no disponible";
						const vendedor =
							resultado.querySelector(".poly-component__seller")?.innerText ||
							"Vendedor no disponible";
						const atributos =
							Array.from(
								resultado.querySelectorAll(
									".poly-component__attributes-list .poly-attributes-list__item"
								)
							).map((attr) => attr.innerText) || [];

						// Filtra solo los resultados que contengan "0 Km" en sus atributos
						const esNuevo = atributos.filter(
							(attr) => attr.trim() === "2024, 0 Km"
						);

						if (titulo && precio && link && esNuevo) {
							data.push({
								titulo,
								precio,
								link,
								ubicacion,
								vendedor,
								atributos: atributos.join(", "),
							});
						}
					});
					return data;
				});

				allProducts = allProducts.concat(products); // Acumula los resultados

				// Verifica si hay un botón de "Siguiente" y haz clic en él
				const siguienteBoton = await page.$('a[title="Siguiente"]'); // Selector del botón "Siguiente"

				if (siguienteBoton) {
					// Verifica si el botón está habilitado
					const isDisabled = await page.evaluate((element) => {
						return element
							.closest("li")
							.classList.contains("andes-pagination__button--disabled");
					}, siguienteBoton);

					if (!isDisabled) {
						try {
							// Desplazarse a la vista del botón
							await page.evaluate((element) => {
								element.scrollIntoView();
							}, siguienteBoton);

							// Hacer clic en el botón "Siguiente" y esperar a que la navegación se complete
							await Promise.all([
								siguienteBoton.click(), // Haz clic en el botón "Siguiente"
								page.waitForNavigation({ waitUntil: "networkidle2" }), // Espera a que la navegación se complete
							]);

							await page.waitForTimeout(2000); // Espera un momento para que la nueva página cargue
						} catch (error) {
							console.error(
								"Error al hacer clic en el botón 'Siguiente':",
								error
							);
							break; // Sal del bucle si hay un error
						}
					} else {
						console.log(
							"El botón 'Siguiente' está deshabilitado. No se puede hacer clic."
						);
						break; // Sal del bucle si el botón está deshabilitado
					}
				} else {
					console.log("No se encontró el botón 'Siguiente'.");
					break; // Si no hay botón "Siguiente", sal del bucle
				}
			} while (true);
		}

		// Muestra los datos extraídos en la consola
		if (allProducts.length > 0) {
			console.log("Datos extraídos:", allProducts);
			console.log("Cantidad:", allProducts.length);			
			return allProducts;
		} else {
			console.warn(
				"No se encontraron datos para extraer. Verifique los selectores o los resultados de la búsqueda."
			);
			return allProducts;			
		}
	} catch (error) {
		console.log("Error corriendo Puppeteer:", error);
	} finally {
		// Cierra el navegador
		console.log("Cerrando el navegador...");
		isScraping = false;
		await browser.close();
	}
};
