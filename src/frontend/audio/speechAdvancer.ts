import { writable } from "svelte/store"
import { outputs } from "../stores"
import { getFirstActiveOutput } from "../components/helpers/output"
import { getSlideText } from "../components/edit/scripts/textStyle"
import { _show } from "../components/helpers/shows"
import { nextSlide } from "../components/helpers/showActions"

export const voiceAutoAdvanceEnabled = writable(false)

class SpeechAdvancerService {
    private recognition: any
    private isListening = false
    private expectedText = ""
    private lastOutputText = ""

    constructor() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition()
            this.recognition.continuous = true
            this.recognition.interimResults = true
            this.recognition.lang = "en-US"

            this.recognition.onresult = this.handleResult.bind(this)
            this.recognition.onerror = this.handleError.bind(this)
            this.recognition.onend = this.handleEnd.bind(this)
        } else {
            console.warn("Speech recognition not supported in this environment.")
        }

        // Subscribe to outputs to know current slide text
        outputs.subscribe((outs) => {
            if (!this.isListening) return
            const outputId = getFirstActiveOutput()?.id
            if (!outputId) return
            
            const currentOutput = outs[outputId]
            const slideIds = currentOutput?.out?.slide
            if (!slideIds || !slideIds.id || slideIds.index === undefined) return
            
            // Get the actual slide data
            const layout = _show(slideIds.id).layouts([slideIds.layout || "active"]).ref()[0]
            if (!layout || !layout[slideIds.index]) return
            
            const slide = _show(slideIds.id).slides([layout[slideIds.index].id]).get()[0]
            if (!slide) return
            
            const text = getSlideText(slide as any).trim()
            if (this.lastOutputText !== text) {
                this.lastOutputText = text
                // We typically want to listen for the last few words
                const words = text.replace(/[\n\r]/g, " ").split(" ").filter(w => w.length > 2)
                if (words.length > 3) {
                    this.expectedText = words.slice(-3).join(" ").toLowerCase().replace(/[.,!?;:]/g, "")
                } else {
                    this.expectedText = words.join(" ").toLowerCase().replace(/[.,!?;:]/g, "")
                }
            }
        })
    }

    start() {
        if (!this.recognition || this.isListening) return
        try {
            this.recognition.start()
            this.isListening = true
        } catch (e) {
            console.error("Failed to start speech recognition", e)
        }
    }

    stop() {
        if (!this.recognition || !this.isListening) return
        this.isListening = false
        try {
            this.recognition.stop()
        } catch (e) {}
    }

    private handleResult(event: any) {
        if (!this.isListening || !this.expectedText) return

        let interimTranscript = ""
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const transcript = event.results[i][0].transcript.toLowerCase().replace(/[.,!?;:]/g, "")
                this.checkMatch(transcript)
            } else {
                interimTranscript += event.results[i][0].transcript.toLowerCase().replace(/[.,!?;:]/g, "")
            }
        }
        
        if (interimTranscript) {
            this.checkMatch(interimTranscript)
        }
    }

    private checkMatch(transcript: string) {
        if (transcript.includes(this.expectedText)) {
            // We got a match for the end of the slide
            console.log("Speech matched end of slide!", this.expectedText)
            
            // Temporarily clear expected text to avoid multiple triggers
            this.expectedText = ""
            
            // Advance slide
            nextSlide(null as any) // `e` is null here, but nextSlide handles it
        }
    }

    private handleError(event: any) {
        console.error("Speech recognition error", event.error)
    }

    private handleEnd() {
        if (this.isListening) {
            // Restart if it stopped but should still be listening
            try {
                this.recognition.start()
            } catch (e) {}
        }
    }
}

export const SpeechAdvancer = new SpeechAdvancerService()

voiceAutoAdvanceEnabled.subscribe((enabled) => {
    if (enabled) {
        SpeechAdvancer.start()
    } else {
        SpeechAdvancer.stop()
    }
})
