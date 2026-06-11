return {
	"nvim-tree/nvim-tree.lua",
	version = "*",
	lazy = false,
	dependencies = {
		"nvim-tree/nvim-web-devicons",
	},
	config = function()
		require("nvim-tree").setup({
			view = {
				side = "left",
			},
			git = {
				-- default 400ms sits exactly at escher's idle `git status` time
				-- (~399ms measured), so git integration randomly disables itself
				timeout = 4000,
			},
		})
	end,
}
