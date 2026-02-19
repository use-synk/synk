const APPROX_CHARS_PER_TOKEN = 4;

export const estimateTokenCount = (value: string): number => {
	if (value.length === 0) {
		return 0;
	}

	return Math.ceil(value.length / APPROX_CHARS_PER_TOKEN);
};
