require("config.lazy")
require("config.keymaps")
require("config.options")
require("scripts.toggletheme")

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*.grc",
	callback = function()
		vim.opt.syntax = "enable"
		vim.bo.filetype = "grace"
	end,
})

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = { "*.tf", "*.tfvars", "*.hcl" },
	callback = function()
		vim.bo.filetype = "terraform"
		vim.bo.commentstring = "# %s"
	end,
})

-- Force-stop all LSP clients on quit to prevent terminal hanging
vim.api.nvim_create_autocmd("VimLeavePre", {
	callback = function()
		for _, client in ipairs(vim.lsp.get_clients()) do
			client:stop(true)
		end
	end,
})
