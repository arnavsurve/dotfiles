local prettier_markers = {
	".prettierrc",
	".prettierrc.json",
	".prettierrc.yml",
	".prettierrc.yaml",
	".prettierrc.js",
	".prettierrc.cjs",
	".prettierrc.mjs",
	".prettierrc.toml",
	"prettier.config.js",
	"prettier.config.cjs",
	"prettier.config.mjs",
	"prettier.config.ts",
}

local function find_marker(dir, markers)
	for _, m in ipairs(markers) do
		if vim.fs.find(m, { upward = true, path = dir })[1] then
			return true
		end
	end
	return false
end

local function web_formatter(bufnr)
	local bufname = vim.api.nvim_buf_get_name(bufnr)
	local dir = vim.fs.dirname(bufname)
	if vim.fs.find(".oxfmtrc.json", { upward = true, path = dir })[1] then
		return { "oxfmt" }
	end
	if vim.fs.find("biome.json", { upward = true, path = dir })[1] or vim.fs.find("biome.jsonc", { upward = true, path = dir })[1] then
		return { "biome" }
	end
	if find_marker(dir, prettier_markers) then
		return { "prettierd" }
	end
	return { lsp_format = "fallback" }
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
