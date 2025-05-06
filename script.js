document.addEventListener("DOMContentLoaded", () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const toneButtonsContainer = document.getElementById("toneButtonsContainer");
    const frequencyInput = document.getElementById("frequency");
    const addToneButton = document.getElementById("addToneButton");
    const startFrequencyInput = document.getElementById("startFrequency");
    const deltaFrequencyInput = document.getElementById("deltaFrequency");
    const numButtonsInput = document.getElementById("numButtons");
    const bulkAddButton = document.getElementById("bulkAddButton");
    const instrumentSelect = document.getElementById("instrumentSelect"); // Added instrument selector
    const clearAllButton = document.getElementById("clearAllButton"); // Added clear all button
    const visualizerCanvas = document.getElementById("audioVisualizerCanvas");
    const vizWidthInput = document.getElementById("vizWidth");
    const vizHeightInput = document.getElementById("vizHeight");
    let vizCtx = visualizerCanvas.getContext("2d");
    let analyserNode;
    let dataArray;
    let drawVisual;

    let buttons = []; 
    let isAssigningKey = false;
    let buttonToAssign = null;
    let currentInstrument = "sine"; // Default instrument
    let vizWidth = 300;
    let vizHeight = 100;

    // --- Audio Analyser Setup ---
    function setupAnalyser() {
        if (!audioContext) return;
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        const bufferLength = analyserNode.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }

    // --- Audio Playback --- 
    function playTone(frequency) {
        if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = currentInstrument; // Use selected instrument
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);

        oscillator.connect(gainNode);
        gainNode.connect(analyserNode); // Connect gain to analyser
        analyserNode.connect(audioContext.destination); // Connect analyser to destination

        oscillator.start();
        visualize(); // Start visualization
        oscillator.stop(audioContext.currentTime + 1);

        // Stop visualization shortly after sound stops
        setTimeout(() => {
            if (drawVisual) {
                cancelAnimationFrame(drawVisual);
                // Optionally clear the canvas when sound stops
                // vizCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
            }
        }, 1100); // A bit longer than oscillator duration
    }

    // --- Audio Visualizer Drawing ---
    function visualize() {
        if (!analyserNode) return;

        const bufferLength = analyserNode.frequencyBinCount;
        analyserNode.getByteTimeDomainData(dataArray); // Get waveform data

        vizCtx.fillStyle = "#f4f4f4"; // Background to match page
        vizCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

        vizCtx.lineWidth = 2;
        vizCtx.strokeStyle = "#5cb85c"; // Green to match buttons

        vizCtx.beginPath();

        const sliceWidth = visualizerCanvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0; // Normalize data to 0-2 range
            const y = v * visualizerCanvas.height / 2;

            if (i === 0) {
                vizCtx.moveTo(x, y);
            } else {
                vizCtx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        vizCtx.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
        vizCtx.stroke();

        drawVisual = requestAnimationFrame(visualize);
    }

    // --- Tab Switching --- 
    window.openTab = function(evt, tabName) {
        let i, tabcontent, tablinks;
        tabcontent = document.getElementsByClassName("tab-content");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        tablinks = document.getElementsByClassName("tab-link");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    }

    // --- Button Management --- 
    function createButtonElement(buttonData) {
        const buttonElement = document.createElement("div");
        buttonElement.classList.add("tone-button");
        buttonElement.dataset.id = buttonData.id;
        buttonElement.dataset.freq = buttonData.freq;
        updateButtonDisplay(buttonElement, buttonData);

        buttonElement.addEventListener("click", (event) => {
            // Check if the delete button was clicked
            if (event.target.classList.contains("delete-btn")) {
                const buttonIdToDelete = event.target.dataset.id;
                deleteButton(buttonIdToDelete);
                return; // Stop further processing for this click
            }

            if (isAssigningKey && buttonToAssign === buttonData) {
                isAssigningKey = false;
                buttonToAssign.element.classList.remove("assigning");
                buttonToAssign = null;
                console.log("Key assignment cancelled.");
            } else if (buttonData.key === null) {
                if (buttonToAssign) {
                    buttonToAssign.element.classList.remove("assigning");
                }
                isAssigningKey = true;
                buttonToAssign = buttonData;
                buttonElement.classList.add("assigning");
                console.log(`Assigning key to button ID ${buttonData.id} (Freq: ${buttonData.freq} Hz). Press a key.`);
            } else {
                playTone(buttonData.freq);
                buttonElement.classList.add("playing");
                setTimeout(() => buttonElement.classList.remove("playing"), 500);
            }
        });

        toneButtonsContainer.appendChild(buttonElement);
        buttonData.element = buttonElement;
    }

    function deleteButton(buttonId) {
        buttons = buttons.filter(button => button.id !== buttonId);
        const buttonElementToRemove = toneButtonsContainer.querySelector(`[data-id="${buttonId}"]`);
        if (buttonElementToRemove) {
            toneButtonsContainer.removeChild(buttonElementToRemove);
        }
        saveSettings();
        console.log(`Button ID ${buttonId} deleted.`);
    }

    function updateButtonDisplay(buttonElement, buttonData) {
        const keyDisplay = buttonData.key ? buttonData.key.toUpperCase() : "[Unassigned]";
        const freqDisplay = `${buttonData.freq.toFixed(2)} Hz`;
        // Add a delete button (X) to each tone button
        buttonElement.innerHTML = `${keyDisplay}<span>${freqDisplay}</span><span class="delete-btn" data-id="${buttonData.id}">&times;</span>`;
        if (buttonData.key === null) {
            buttonElement.classList.add("unassigned");
        } else {
            buttonElement.classList.remove("unassigned");
        }
    }

    function saveSettings() {
        const savableButtons = buttons.map(b => ({ id: b.id, freq: b.freq, key: b.key }));
        const settings = {
            buttons: savableButtons,
            instrument: currentInstrument,
            vizWidth: parseInt(vizWidthInput.value),
            vizHeight: parseInt(vizHeightInput.value)
        };
        localStorage.setItem("customToneSettings", JSON.stringify(settings));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem("customToneSettings");
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            if (parsedSettings.buttons) {
                buttons = parsedSettings.buttons.map(b => ({ ...b, element: null }));
                toneButtonsContainer.innerHTML = "";
                buttons.forEach(createButtonElement);
            }
            if (parsedSettings.instrument) {
                currentInstrument = parsedSettings.instrument;
                instrumentSelect.value = currentInstrument;
            }
            if (parsedSettings.vizWidth && parsedSettings.vizHeight) {
                vizWidth = parsedSettings.vizWidth;
                vizHeight = parsedSettings.vizHeight;
                vizWidthInput.value = vizWidth;
                vizHeightInput.value = vizHeight;
                visualizerCanvas.width = vizWidth;
                visualizerCanvas.height = vizHeight;
            } else {
                // Default canvas size if not in storage
                visualizerCanvas.width = vizWidthInput.value;
                visualizerCanvas.height = vizHeightInput.value;
            }
        }
        setupAnalyser(); // Setup analyser after loading settings (including potential audioContext resume)
    }

    // --- Event Listeners ---
    vizWidthInput.addEventListener("change", () => {
        visualizerCanvas.width = parseInt(vizWidthInput.value);
        vizWidth = visualizerCanvas.width;
        saveSettings();
    });

    vizHeightInput.addEventListener("change", () => {
        visualizerCanvas.height = parseInt(vizHeightInput.value);
        vizHeight = visualizerCanvas.height;
        saveSettings();
    });

    instrumentSelect.addEventListener("change", (event) => {
        currentInstrument = event.target.value;
        saveSettings();
        console.log(`Instrument changed to: ${currentInstrument}`);
    });

    clearAllButton.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all tone buttons?")) {
            buttons = [];
            toneButtonsContainer.innerHTML = ""; // Clear visually
            saveSettings();
            console.log("All tone buttons cleared.");
        }
    });

    addToneButton.addEventListener("click", () => {
        const freq = parseFloat(frequencyInput.value);
        if (isNaN(freq) || freq < 20 || freq > 20000) {
            alert("Please enter a valid frequency between 20 and 20000 Hz.");
            return;
        }
        
        const newButtonData = {
            id: Date.now().toString(),
            freq: freq,
            key: null,
            element: null
        };

        createButtonElement(newButtonData);
        buttons.push(newButtonData);

        if (buttonToAssign) {
             buttonToAssign.element.classList.remove("assigning");
        }
        isAssigningKey = true;
        buttonToAssign = newButtonData;
        newButtonData.element.classList.add("assigning");
        console.log(`Assigning key to new button ID ${newButtonData.id} (Freq: ${freq} Hz). Press a key.`);
    });

    bulkAddButton.addEventListener("click", () => {
        const startFreq = parseFloat(startFrequencyInput.value);
        const deltaFreq = parseFloat(deltaFrequencyInput.value);
        const num = parseInt(numButtonsInput.value);

        if (isNaN(startFreq) || startFreq < 20 || startFreq > 20000) {
            alert("Please enter a valid start frequency between 20 and 20000 Hz.");
            return;
        }
        if (isNaN(deltaFreq)) {
            alert("Please enter a valid frequency step.");
            return;
        }
        if (isNaN(num) || num < 1 || num > 100) {
            alert("Please enter a valid number of buttons between 1 and 100.");
            return;
        }

        console.log(`Bulk adding ${num} buttons starting at ${startFreq} Hz with step ${deltaFreq} Hz.`);

        for (let i = 0; i < num; i++) {
            const currentFreq = startFreq + (i * deltaFreq);
            if (currentFreq < 20 || currentFreq > 20000) {
                console.warn(`Skipping button creation for calculated frequency ${currentFreq.toFixed(2)} Hz as it's outside the 20-20000 Hz range.`);
                continue;
            }

            const newButtonData = {
                id: Date.now().toString() + i,
                freq: currentFreq,
                key: null,
                element: null
            };
            createButtonElement(newButtonData);
            buttons.push(newButtonData);
        }
        saveSettings();
    });

    // --- Keyboard Listener (for playing and assigning) ---
    document.addEventListener("keydown", (event) => {
        const pressedKey = event.key.toLowerCase();

        if (isAssigningKey && buttonToAssign) {
            const existingButton = buttons.find(b => b.key === pressedKey);
            if (existingButton && existingButton !== buttonToAssign) {
                alert(`Key '${pressedKey.toUpperCase()}' is already assigned to ${existingButton.freq.toFixed(2)} Hz. Please choose a different key.`);
                return;
            }

            buttonToAssign.key = pressedKey;
            updateButtonDisplay(buttonToAssign.element, buttonToAssign);
            buttonToAssign.element.classList.remove("assigning");
            console.log(`Assigned key '${pressedKey.toUpperCase()}' to button ID ${buttonToAssign.id}`);
            isAssigningKey = false;
            buttonToAssign = null;
            saveSettings();
        } else {
            const targetButton = buttons.find(b => b.key === pressedKey);
            if (targetButton && targetButton.element) {
                playTone(targetButton.freq);
                targetButton.element.classList.add("playing");
                setTimeout(() => {
                    if (targetButton.element) {
                        targetButton.element.classList.remove("playing");
                    }
                }, 500);
            }
        }
    });

    // --- Initial Load ---
    loadSettings();

});
