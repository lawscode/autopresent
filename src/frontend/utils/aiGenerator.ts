import { get } from "svelte/store"
import { special } from "../stores"
import { ShowObj } from "../classes/Show"
import { uid } from "uid"
import type { Slide, SlideData } from "../../types/Show"

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

export async function generateSlidesFromText(text: string, title?: string): Promise<ShowObj | null> {
    const apiKey = get(special).openAiApiKey
    if (!apiKey) {
        throw new Error("OpenAI API key is missing. Please set it in Settings > Other.")
    }

    const systemPrompt = `You are a presentation assistant. The user will provide a text or transcript. 
Extract the key points and format them into a JSON array of slide objects. 
Each slide should have "text" (the main text for the slide) and "notes" (optional extra context for the presenter).
Keep it concise and punchy. Return cleanly formatted JSON array like:
[
  { "text": "Slide 1 Text", "notes": "Summary of point 1" },
  { "text": "Slide 2 Text", "notes": "Summary of point 2" }
]
Only return the JSON array, nothing else.`

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", // Use gpt-4o-mini as a good default for text
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                temperature: 0.7
            })
        })

        if (!response.ok) {
            const err = await response.json()
            throw new Error(err.error?.message || "Failed to generate slides from OpenAI")
        }

        const data = await response.json()
        let result = data.choices[0].message.content.trim()
        
        // Post-process the result to ensure it's valid JSON
        if (result.startsWith("\`\`\`json")) result = result.slice(7)
        if (result.endsWith("\`\`\`")) result = result.slice(0, -3)
        if (result.startsWith("\`\`\`")) result = result.slice(3)

        const slidesData = JSON.parse(result)

        const layoutId = uid()
        const show = new ShowObj(false, null, layoutId)
        show.name = title || "AI Generated Presentation"
        
        if (Array.isArray(slidesData)) {
            const slides: { [key: string]: Slide } = {}
            const layouts: SlideData[] = []
            
            for (const slideData of slidesData) {
                const id = uid()
                layouts.push({ id })
                
                slides[id] = {
                    group: "verse",
                    color: null,
                    settings: {},
                    notes: slideData.notes || "",
                    items: [
                        {
                            type: "text",
                            style: "",
                            lines: [ { align: "center", text: [ { value: slideData.text, style: "" } ] } ]
                        }
                    ]
                }
            }
            
            show.slides = slides
            if (show.layouts && show.layouts[layoutId]) {
                show.layouts[layoutId].slides = layouts
            }
        }

        return show as unknown as ShowObj
    } catch (e: any) {
        throw new Error(e.message || "Failed to process AI generation")
    }
}
