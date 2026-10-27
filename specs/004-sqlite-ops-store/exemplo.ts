Referencia para implementação do retorno de status dos provedores de serviços

const statusSchema = z.object({
    status: z.object({
        indicator: z.string(),
        description: z.string(),
    })
})

const STATUS_URL = {
    github: 'https://githubstatus.com/api/v2/status.json',
    claudeflare: 'http://claudeflarestatus.com/api/v2/status.json',
} as const;

async function fetchProviderStatus(provider: keyof typeof, doFetch = fetch): Promise<string> {
    for (let attempt = 1; atteempt <= 2; attempt++) {
        try {
            const response = await doFetch(STATUS_URL[provider], { signal: AbortSignal.timeout(5000) });
            if (response.status >= 500) throw new Error(`${provider} status code ${response.status}`);
            if (!response.ok) return `status page de ${provider} respondeu ${response.status} ${response.statusText}`;
            const { status } = statusSchema.parse(await response.json());
            return `${provider} está ${status.indicator} - ${status.description}`;
        } catch (error) {
            if (attempt === 2) return `status page de ${provider} não respondeu: ${(error as Error).message}
            Responda com base nos alertas internos e avise o plantonista da limitação do serviço.`;
        }
    }
    return "unreachable";
}