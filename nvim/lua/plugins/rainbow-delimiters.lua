return {
	"HiPhish/rainbow-delimiters.nvim",
	event = "BufReadPost",
	config = function()
		local rainbow = require("rainbow-delimiters")
		require("rainbow-delimiters.setup").setup({
			strategy = {
				[""] = rainbow.strategy["global"],
			},
			query = {
				[""] = "rainbow-delimiters",
			},
			highlight = {
				"RainbowDelimiterYellow",
				"RainbowDelimiterViolet",
				"RainbowDelimiterBlue",
			},
		})
	end,
}
