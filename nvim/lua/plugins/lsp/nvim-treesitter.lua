return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	lazy = false,
	config = function()
		local parsers = {
			"c",
			"lua",
			"vim",
			"html",
			"css",
			"javascript",
			"typescript",
			"tsx",
			"json",
			"yaml",
			"python",
			"go",
			"gomod",
			"gowork",
			"gosum",
			"svelte",
			"markdown",
			"markdown_inline",
			"java",
			"kotlin",
			"latex",
			"hcl",
			"terraform",
			"rust",
			"toml",
		}

		-- Install missing parsers (async, no-op if already installed)
		require("nvim-treesitter").install(parsers)

		-- Enable treesitter highlighting and indentation
		vim.api.nvim_create_autocmd("FileType", {
			callback = function(args)
				if args.match == "html" then
					return
				end
				pcall(vim.treesitter.start, args.buf)
				vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
			end,
		})
	end,
}
