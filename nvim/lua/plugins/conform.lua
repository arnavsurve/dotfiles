--- Pick oxfmt when the project has .oxfmtrc.json, otherwise biome.
local function web_formatter(bufnr)
	local bufname = vim.api.nvim_buf_get_name(bufnr)
	local dir = vim.fs.dirname(bufname)
	if vim.fs.find(".oxfmtrc.json", { upward = true, path = dir })[1] then
		return { "oxfmt" }
	end
	return { "biome" }
end

return {
	"stevearc/conform.nvim",
	opts = {
		formatters_by_ft = {
			lua = { "stylua" },
			python = { "isort", "black" },
			css = { "biome" },
			html = { "biome" },
			javascript = web_formatter,
			javascriptreact = web_formatter,
			typescript = web_formatter,
			typescriptreact = web_formatter,
			json = web_formatter,
			jsonc = web_formatter,
			kotlin = { "ktlint" },
			java = { "google-java-format" },
			go = { "gofumpt" },
			rust = { "rustfmt" },
		},

		format_on_save = {
			timeout_ms = 1000,
			lsp_fallback = true,
		},
	},
}
